import { useEffect, useRef } from "react"
import * as THREE from "three"

// Biconcave red blood cell profile (Evans & Fung, 1972), normalised to radius 1.
// Thickness h(ρ) = √(1−ρ²)(C0 + C2ρ² + C4ρ⁴) with R = 3.91 µm.
function cellGeometry(segments: number) {
  const half = (p: number) =>
    (Math.sqrt(Math.max(0, 1 - p * p)) * (0.81 + 7.83 * p * p - 4.39 * p ** 4)) / (2 * 3.91)
  const points: THREE.Vector2[] = []
  const steps = 40
  // Sine spacing packs vertices near the rim, where the curvature is.
  for (let i = 0; i <= steps; i++) {
    const p = Math.sin(((i / steps) * Math.PI) / 2)
    points.push(new THREE.Vector2(p, -half(p)))
  }
  for (let i = steps - 1; i >= 0; i--) {
    const p = Math.sin(((i / steps) * Math.PI) / 2)
    points.push(new THREE.Vector2(p, half(p)))
  }
  const geometry = new THREE.LatheGeometry(points, segments)
  geometry.computeVertexNormals()
  return geometry
}

type Cell = {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  spin: THREE.Quaternion
  scale: number
  drift: number
}

// Full-bleed WebGL field of drifting erythrocytes with one large focal cell.
export default function LandingCells({ focal = true }: { focal?: boolean }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" })
    } catch {
      return // No WebGL: the CSS gradient behind the canvas stays.
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x05070d, 10, 34)
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.set(0, 0, 15)

    scene.add(new THREE.HemisphereLight(0x7b8fc4, 0x22040a, 0.7))
    const key = new THREE.DirectionalLight(0xffe4da, 2.6)
    key.position.set(6, 7, 9)
    const rim = new THREE.DirectionalLight(0x5fd4ff, 2.2)
    rim.position.set(-7, -3, -6)
    const glow = new THREE.PointLight(0xff2a3c, 60, 26, 1.6)
    glow.position.set(3, -3, 5)
    scene.add(key, rim, glow)

    const material = new THREE.MeshPhysicalMaterial({
      color: 0xb3101c,
      roughness: 0.42,
      clearcoat: 0.55,
      clearcoatRoughness: 0.3,
      sheen: 1,
      sheenColor: new THREE.Color(0xff8a80),
      sheenRoughness: 0.45,
    })

    const small = innerWidth < 760
    const count = small ? 46 : 110
    const geometry = cellGeometry(small ? 40 : 56)
    const field = new THREE.InstancedMesh(geometry, material, count)
    const random = (min: number, max: number) => min + Math.random() * (max - min)
    const axis = new THREE.Vector3()
    const cells: Cell[] = Array.from({ length: count }, () => {
      axis.set(random(-1, 1), random(-1, 1), random(-1, 1)).normalize()
      return {
        position: new THREE.Vector3(random(-17, 17), random(-11, 11), random(-22, 3)),
        quaternion: new THREE.Quaternion().setFromAxisAngle(axis, random(0, Math.PI * 2)),
        spin: new THREE.Quaternion().setFromAxisAngle(axis.clone(), random(0.002, 0.008)),
        scale: random(0.45, 1.05),
        drift: random(0.25, 0.7),
      }
    })
    scene.add(field)

    const hero = new THREE.Mesh(cellGeometry(128), material.clone())
    hero.visible = focal
    scene.add(hero)

    // Plasma "dust" adds depth between the cells.
    const dustCount = small ? 260 : 600
    const dust = new Float32Array(dustCount * 3)
    for (let i = 0; i < dustCount; i++) {
      dust.set([random(-20, 20), random(-12, 12), random(-24, 6)], i * 3)
    }
    const dustGeometry = new THREE.BufferGeometry()
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(dust, 3))
    const dustMaterial = new THREE.PointsMaterial({
      color: 0xff9a9a,
      size: 0.05,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const particles = new THREE.Points(dustGeometry, dustMaterial)
    scene.add(particles)

    let heroX = 0
    let heroY = 0
    let heroScale = 3.4
    function resize() {
      const { clientWidth: w, clientHeight: h } = el!
      renderer.setSize(w, h, false)
      camera.aspect = w / Math.max(h, 1)
      camera.updateProjectionMatrix()
      const visibleWidth = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 13 * camera.aspect
      const wide = camera.aspect > 1.15
      heroX = wide ? visibleWidth * 0.24 : visibleWidth * 0.3
      heroY = wide ? 0.3 : 4.6
      heroScale = wide ? Math.min(3.6, visibleWidth * 0.17) : 1.8
    }
    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(el)

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 }
    function onPointer(event: PointerEvent) {
      pointer.tx = (event.clientX / innerWidth) * 2 - 1
      pointer.ty = (event.clientY / innerHeight) * 2 - 1
    }
    addEventListener("pointermove", onPointer, { passive: true })

    const matrix = new THREE.Matrix4()
    const scaleVector = new THREE.Vector3()
    const clock = new THREE.Clock()
    let frame = 0
    let visible = true
    let time = 0

    function render() {
      const dt = Math.min(clock.getDelta(), 0.05)
      time += dt
      pointer.x += (pointer.tx - pointer.x) * 0.04
      pointer.y += (pointer.ty - pointer.y) * 0.04
      const scroll = Math.min(scrollY / innerHeight, 1.5)

      cells.forEach((cell, i) => {
        cell.position.y += cell.drift * dt
        if (cell.position.y > 12) cell.position.y = -12
        cell.quaternion.multiply(cell.spin)
        scaleVector.setScalar(cell.scale)
        matrix.compose(cell.position, cell.quaternion, scaleVector)
        field.setMatrixAt(i, matrix)
      })
      field.instanceMatrix.needsUpdate = true

      hero.position.set(heroX + pointer.x * 0.25, heroY - scroll * 2.4 + Math.sin(time * 0.6) * 0.18, 3)
      hero.rotation.set(1.05 + Math.sin(time * 0.35) * 0.35 + pointer.y * 0.2, time * 0.18, 0.35 + pointer.x * 0.2)
      hero.scale.setScalar(heroScale)

      particles.rotation.y = time * 0.01
      camera.position.x = pointer.x * 0.8
      camera.position.y = -pointer.y * 0.5 - scroll * 1.2
      camera.lookAt(0, -scroll * 1.2, 0)
      renderer.render(scene, camera)
      if (visible && !reduceMotion) frame = requestAnimationFrame(render)
    }

    // Only animate while the canvas is on screen.
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      cancelAnimationFrame(frame)
      if (visible) {
        clock.getDelta()
        frame = requestAnimationFrame(render)
      }
    })
    intersection.observe(el)

    return () => {
      cancelAnimationFrame(frame)
      intersection.disconnect()
      resizeObserver.disconnect()
      removeEventListener("pointermove", onPointer)
      geometry.dispose()
      hero.geometry.dispose()
      ;(hero.material as THREE.Material).dispose()
      material.dispose()
      dustGeometry.dispose()
      dustMaterial.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [focal])

  return <div ref={host} className="lp-cells" aria-hidden="true" />
}
