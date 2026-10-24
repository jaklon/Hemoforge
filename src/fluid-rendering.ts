import * as THREE from "three"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"
import { FLUID_BASE, FLUID_RADIUS, SPARGER_HEIGHT, FluidClock, bubblePoint, circulationPoint, fluidShape, surfaceProfile, surfaceOffset } from "./fluid-motion"

/** One PBR surface/body mesh, one bubble mesh, one tracer mesh, one ripple mesh.
 * No transmission render pass, framebuffer copy, noise texture or remote asset. */
export function createCultureFluid(parent: THREE.Object3D) {
  const uniforms = {
    hfHeight: { value: .35 }, hfDepth: { value: 0 }, hfWave: { value: 0 }, hfPhase: { value: 0 },
  }
  const side = new THREE.CylinderGeometry(FLUID_RADIUS,FLUID_RADIUS,1,64,1,true).translate(0,.5,0)
  const cap = new THREE.RingGeometry(0,FLUID_RADIUS,64,10).rotateX(-Math.PI/2).translate(0,1,0)
  const geometry = mergeGeometries([side,cap])!
  side.dispose(); cap.dispose()
  const material = new THREE.MeshPhysicalMaterial({
    color: "#c49a7e", roughness: .15, metalness: 0, clearcoat: .8, clearcoatRoughness: .12,
    transparent: true, opacity: .46, depthWrite: false, side: THREE.DoubleSide,
  })
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms,uniforms)
    const declarations = `
      uniform float hfHeight, hfDepth, hfWave, hfPhase;
      varying float hfTop;
      vec3 hfSurface(vec2 p) {
        float inv = 1.0 / ${FLUID_RADIUS*FLUID_RADIUS};
        float s = sin(hfPhase), c = cos(hfPhase);
        float h = hfDepth*(2.0*dot(p,p)*inv-1.0)
          + hfWave*((p.x*p.x-p.y*p.y)*s+2.0*p.x*p.y*c)*inv;
        vec2 slope = 4.0*hfDepth*p*inv
          + 2.0*hfWave*vec2(p.x*s+p.y*c,-p.y*s+p.x*c)*inv;
        return vec3(h,slope);
      }`
    shader.vertexShader = shader.vertexShader.replace("#include <common>",`#include <common>\n${declarations}`)
      .replace("#include <beginnormal_vertex>",`#include <beginnormal_vertex>
        hfTop = step(0.5,normal.y);
        if(hfTop > 0.5) {
          vec3 hfSample = hfSurface(position.xz);
          objectNormal = normalize(vec3(-hfSample.y/max(hfHeight,0.0001),1.0,-hfSample.z/max(hfHeight,0.0001)));
        }`)
      .replace("#include <begin_vertex>",`#include <begin_vertex>
        if(position.y > 0.99) transformed.y += hfSurface(position.xz).x/max(hfHeight,0.0001);`)
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>","#include <common>\nvarying float hfTop;")
      .replace("#include <color_fragment>","#include <color_fragment>\ndiffuseColor.a *= mix(0.42,0.92,hfTop);")
  }
  material.customProgramCacheKey = () => "hemoforge-culture-surface-1"
  const liquid = new THREE.Mesh(geometry,material)
  liquid.position.y = FLUID_BASE
  liquid.frustumCulled = false // Shader waves extend slightly beyond the flat cap.
  liquid.renderOrder = 3
  parent.add(liquid)

  const bubbleMaterial = new THREE.MeshStandardMaterial({
    color: "#e0eef0", roughness: .12, metalness: .05,
    transparent: true, opacity: .78, depthWrite: false,
  })
  bubbleMaterial.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>",`
      diffuseColor.a *= 0.18+0.82*pow(1.0-abs(dot(normal,normalize(vViewPosition))),2.0);
      #include <opaque_fragment>`)
  }
  bubbleMaterial.customProgramCacheKey = () => "hemoforge-bubble-rim-1"
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),bubbleMaterial,144)
  const tracers = new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),new THREE.MeshStandardMaterial({ color: "#d6a291",roughness:.65 }),80)
  for(const object of [bubbles,tracers]) {
    object.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    object.frustumCulled = false
    object.renderOrder = 2
    parent.add(object)
  }

  // Tiny rings mark bubble arrival at the free surface, never an accumulating foam layer.
  const ringGeometry = new THREE.RingGeometry(.72,1,24).rotateX(-Math.PI/2)
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(12),1)
  ringGeometry.setAttribute("hfFade",fade)
  const ringMaterial = new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
    vertexShader:`attribute float hfFade; varying float fade;
      void main(){ fade=hfFade; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }`,
    fragmentShader:`varying float fade;
      void main(){ gl_FragColor=vec4(0.95,0.88,0.74,fade*0.28);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const ripples = new THREE.InstancedMesh(ringGeometry,ringMaterial,12)
  ripples.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  ripples.frustumCulled = false
  ripples.renderOrder = 4
  parent.add(ripples)
  const clock = new FluidClock()
  const marker = new THREE.Object3D()
  const point = {x:0,y:0,z:0,radius:0}
  let previousHeight = -1, previousMix = -1, previousGas = -1
  return {
    update(volumeMl: number, rpm: number, gas: number, delta: number, active: boolean, balanced: boolean) {
      const shape = fluidShape(volumeMl,rpm)
      clock.advance(delta,active,shape.drive,shape.present ? gas : 0)
      liquid.visible = shape.present
      bubbles.visible = shape.present && gas > 0 && FLUID_BASE+shape.height > SPARGER_HEIGHT+.03
      ripples.visible = bubbles.visible
      tracers.visible = shape.present
      bubbles.count = balanced ? 80 : 144
      tracers.count = balanced ? 48 : 80
      const profile = surfaceProfile(shape.height,clock.drive,clock.mix*2.4)
      liquid.scale.y = Math.max(.0001,shape.height)
      uniforms.hfHeight.value = shape.height
      uniforms.hfDepth.value = profile.depth
      uniforms.hfWave.value = profile.wave
      uniforms.hfPhase.value = profile.phase
      if (shape.height === previousHeight && clock.mix === previousMix && clock.gas === previousGas) return
      previousHeight=shape.height; previousMix=clock.mix; previousGas=clock.gas
      for(let i=0; i<144; i++) {
        bubblePoint(point,i,clock,shape.height)
        marker.position.set(point.x,point.y,point.z)
        // Mild buoyancy elongation; no camera-facing opaque disks.
        marker.scale.set(point.radius*.9,point.radius*1.15,point.radius*.9)
        marker.updateMatrix(); bubbles.setMatrixAt(i,marker.matrix)
      }
      bubbles.instanceMatrix.needsUpdate = true
      for(let i=0; i<80; i++) {
        circulationPoint(point,i,clock.mix,shape.height)
        marker.position.set(point.x,point.y,point.z)
        marker.scale.setScalar(point.radius)
        marker.updateMatrix(); tracers.setMatrixAt(i,marker.matrix)
      }
      tracers.instanceMatrix.needsUpdate = true
      for(let i=0; i<12; i++) {
        const age = (clock.gas*.7+i/12)%1
        const theta = i*2.399963
        const x = Math.cos(theta)*(.27+.035*Math.sin(i))
        const z = Math.sin(theta)*(.27+.035*Math.sin(i))
        // Same analytic cap as the PBR mesh, offset only to avoid z fighting.
        const offset = surfaceOffset(x,z,profile.depth,profile.wave,profile.phase)
        marker.position.set(x,FLUID_BASE+shape.height+offset+.0015,z)
        marker.scale.setScalar(.008+age*.035)
        marker.updateMatrix(); ripples.setMatrixAt(i,marker.matrix)
        fade.setX(i,(1-age)*clock.aeration)
      }
      fade.needsUpdate = true
      ripples.instanceMatrix.needsUpdate = true
    },
  }
}

/** A continuously filled medium line with subtle advected highlights, not air slugs. */
export function createHoseMedium(color: THREE.Color) {
  const travel = {value:0}
  const material = new THREE.MeshStandardMaterial({color,roughness:.29,metalness:0})
  material.onBeforeCompile = shader => {
    shader.uniforms.hfTravel = travel
    shader.vertexShader = shader.vertexShader.replace("#include <common>","#include <common>\nvarying float hfDistance;")
      .replace("#include <begin_vertex>","#include <begin_vertex>\nhfDistance=uv.x;")
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>","#include <common>\nvarying float hfDistance; uniform float hfTravel;")
      .replace("#include <color_fragment>",`#include <color_fragment>
        float streak = pow(0.5+0.5*cos((hfDistance-hfTravel)*39.269908),12.0);
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(0.92,0.86,0.69),streak*0.32);`)
  }
  material.customProgramCacheKey = () => "hemoforge-hose-medium-1"
  return {material,travel}
}
