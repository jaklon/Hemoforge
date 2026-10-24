import * as THREE from "three"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"
import type { TransferView } from "./transfer-visual"
import { liquidHeight } from "./biostat-animation"

/** Original local geometry; one prepared dose and one filtrate receiver, not an inventory model. */
export function createTransferHardware(scene: THREE.Scene) {
  const metal = new THREE.MeshStandardMaterial({color:"#a7b5ba",metalness:.7,roughness:.28})
  const dark = new THREE.MeshStandardMaterial({color:"#193742",roughness:.5})
  const green = new THREE.MeshStandardMaterial({color:"#80c5a6",roughness:.35})
  const violet = new THREE.MeshStandardMaterial({color:"#ae8cbe",roughness:.35})
  function mesh(geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number) {
    const object=new THREE.Mesh(geometry,material)
    object.position.set(x,y,z); scene.add(object)
    return object
  }
  function display(x:number,y:number,z:number) {
    const canvas=document.createElement("canvas"); canvas.width=512; canvas.height=192
    const ctx=canvas.getContext("2d")!,texture=new THREE.CanvasTexture(canvas)
    texture.colorSpace=THREE.SRGBColorSpace
    mesh(new THREE.PlaneGeometry(.65,.24),new THREE.MeshBasicMaterial({map:texture}),x,y,z)
    return (title:string,value:string,note:string) => {
      ctx.fillStyle="#163540";ctx.fillRect(0,0,512,192)
      ctx.textAlign="center";ctx.fillStyle="#8de6bc";ctx.font="bold 29px sans-serif";ctx.fillText(title,256,42)
      ctx.fillStyle="#f2f5e8";ctx.font="bold 39px monospace";ctx.fillText(value,256,100)
      ctx.fillStyle="#bdcfd3";ctx.font="22px sans-serif";ctx.fillText(note,256,153,490)
      texture.needsUpdate=true
    }
  }
  const bags=[-3.5,1].map((x,i) => {
    const wall=new THREE.MeshStandardMaterial({color:"#dfefea",roughness:.22,transparent:true,opacity:.26,depthWrite:false})
    mesh(new RoundedBoxGeometry(.42,.62,.2,2,.025),wall,x,.55,.2)
    const fill=mesh(new RoundedBoxGeometry(.34,.52,.13,2,.02),new THREE.MeshStandardMaterial({color:i ? "#b28ca7" : "#d1ad7a",transparent:true,opacity:.7,depthWrite:false}),x,.55,.2)
    const cap=mesh(new THREE.CylinderGeometry(.035,.035,.07,12),metal,x,.88,.2)
    cap.castShadow=true
    return {fill,paint:display(x,i ? .17 : 1.13,.34)}
  })
  const rotor=new THREE.Group(); rotor.position.set(.72,.86,.29);scene.add(rotor)
  const back=mesh(new THREE.CylinderGeometry(.115,.115,.07,20),dark,.72,.86,.23);back.rotation.x=Math.PI/2
  for(let i=0;i<3;i++) {
    const angle=i*Math.PI*2/3
    const roller=new THREE.Mesh(new THREE.SphereGeometry(.026,8,6),violet)
    roller.position.set(Math.cos(angle)*.067,Math.sin(angle)*.067,.02);rotor.add(roller)
  }
  const valves=[new THREE.Group(),new THREE.Group()]
  for(const [i,valve] of valves.entries()) {
    valve.position.set(i ? 1.14 : .39,i ? 1.0 : .65,i ? .24 : -.55)
    const lever=new THREE.Mesh(new THREE.BoxGeometry(.12,.025,.025),i ? violet : green)
    valve.add(lever);scene.add(valve)
  }
  const guideMaterial = (color:string) => new THREE.MeshBasicMaterial({color,transparent:true,opacity:.55,depthWrite:false})
  const guides=[guideMaterial("#eaf3ee"),guideMaterial("#70d7aa")].map(material => {
    const guide=mesh(new THREE.TorusGeometry(.615,.004,4,64),material,-1.6,.83,-.9)
    guide.rotation.x=Math.PI/2;guide.visible=false;return guide
  })
  const inlet=mesh(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(-1.88,2.14,-.47),new THREE.Vector3(-1.88,.70,-.47)),1,.009,5,false),new THREE.MeshStandardMaterial({color:"#dce4cf",transparent:true,opacity:.45}),0,0,0)
  inlet.name="Virtual feeding dip tube"
  const plume = new THREE.InstancedMesh(new THREE.SphereGeometry(.006,6,4),new THREE.MeshBasicMaterial({color:"#d2d99c",transparent:true,opacity:.5,depthWrite:false}),12)
  plume.instanceMatrix.setUsage(THREE.DynamicDrawUsage);plume.frustumCulled=false;scene.add(plume)
  const marker=new THREE.Object3D()
  let elapsed=0, labelKey=""
  return {
    update(view:TransferView|null,seconds:number) {
      const feed=!!view?.active,exchange=feed && view.kind==="medium_exchange"
      elapsed+=seconds*(feed ? 1 : 0)
      rotor.rotation.z=(rotor.rotation.z-seconds*(exchange ? 3 : 0))%(Math.PI*2)
      valves[0].rotation.z=feed ? Math.PI/2 : 0
      valves[1].rotation.z=exchange ? Math.PI/2 : 0
      for(let i=0;i<2;i++) {
        const fraction=view ? i===0 ? view.remainingMl/view.plannedMl : view.outgoingMl/view.plannedMl : 0
        const fill=bags[i].fill
        fill.visible=fraction>.001
        fill.scale.y=Math.max(.001,fraction);fill.position.y=.29+.26*fraction
        guides[i].visible=!!view && view.status!=="cancelled"
        if(view) guides[i].position.y=.48+liquidHeight(i===0 ? view.before : view.target)
      }
      plume.visible=feed && seconds>=0
      const surface=.48+liquidHeight(view?.visualVolumeMl ?? 0)
      for(let i=0;i<12;i++) {
        const age=(elapsed*1.7+i/12)%1
        marker.position.set(-1.88+age*.12*Math.sin(i*2.4),Math.min(.70,surface-.04)-age*.035,-.47-age*.06)
        marker.scale.setScalar(.2+Math.sin(age*Math.PI)*.8);marker.updateMatrix();plume.setMatrixAt(i,marker.matrix)
      }
      plume.instanceMatrix.needsUpdate=true
      const key=view ? `${view.id}/${view.status}/${Math.round(view.shown*100)}/${view.label}` : "standby"
      if(key!==labelKey) {
        labelKey=key
        bags[0].paint("DOSE MEDIUM / VIRTUAL",view ? `${view.remainingMl.toFixed(0)} / ${view.plannedMl.toFixed(0)} mL` : "STANDBY",view?.label ?? "WAITING FOR GUARD")
        bags[1].paint("FILTRATE / VIRTUAL",view ? `${view.outgoingMl.toFixed(0)} mL OUT` : "0 mL",view?.kind==="medium_exchange" ? "RETENTION + RETURN" : "OUTLET CLOSED")
      }
      return rotor.rotation.z
    },
  }
}
