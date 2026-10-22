import { useEffect, useRef } from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"

interface Props {
  station: "overview" | "bioreactor" | "flex2"
  phase: string
  running: boolean
  progress: number
  volumeMl: number
  onFrame: (seconds: number) => void
  onInteract: () => void
  onError: (message: string) => void
}

export default function LabScene(props: Props) {
  const host = useRef<HTMLDivElement>(null)
  const current = useRef(props)
  current.current = props
  useEffect(() => {
    const container = host.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    } catch {
      current.current.onError(
        "WebGL tidak tersedia. Aktifkan hardware acceleration lalu muat ulang.",
      )
      return
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.25
    container.appendChild(renderer.domElement)
    renderer.domElement.setAttribute(
      "aria-label",
      "3D laboratory: bioreactor, FLEX2 analyzer and gloved hands",
    )
    renderer.domElement.setAttribute("role", "img")
    const scene = new THREE.Scene()
    scene.background = new THREE.Color("#c4d7d7")
    scene.fog = new THREE.Fog("#c4d7d7", 12, 30)
    const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 40)
    camera.position.set(0, 1.75, 5.8)
    scene.add(camera)
    scene.add(new THREE.HemisphereLight(0xe8ffff, 0x667373, 2.4))
    const sun = new THREE.DirectionalLight(0xfff5e1, 3.5)
    sun.position.set(-4, 7, 4)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.left = sun.shadow.camera.bottom = -7
    sun.shadow.camera.right = sun.shadow.camera.top = 7
    scene.add(sun)
    const materials: THREE.Material[] = []
    function material(color: string, metalness = 0, roughness = 0.5) {
      const value = new THREE.MeshStandardMaterial({
        color,
        metalness,
        roughness,
      })
      materials.push(value)
      return value
    }
    const white = material("#eaf0ed"),
      steel = material("#809b9b", 0.75, 0.25)
    const dark = material("#193d42", 0.45),
      teal = material("#167d82", 0.35)
    const red = material("#a62b39"),
      glove = material("#bad4e6", 0, 0.7)
    function box(
      parent: THREE.Object3D,
      size: number[],
      position: number[],
      mat: THREE.Material,
    ) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(...size as [number, number, number]),
        mat,
      )
      mesh.position.set(...position as [number, number, number])
      mesh.castShadow = true
      mesh.receiveShadow = true
      parent.add(mesh)
      return mesh
    }
    function cylinder(
      parent: THREE.Object3D,
      top: number,
      bottom: number,
      height: number,
      position: number[],
      mat: THREE.Material,
    ) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(top, bottom, height, 40),
        mat,
      )
      mesh.position.set(...position as [number, number, number])
      mesh.castShadow = true
      mesh.receiveShadow = true
      parent.add(mesh)
      return mesh
    }
    const textures: THREE.Texture[] = []
    function label(
      text: string,
      width = 1024,
      height = 160,
      color = "#e2f2ee",
      background = "#173c40",
    ) {
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")!
      ctx.fillStyle = background
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = color
      ctx.font = `600 ${Math.floor(height * 0.42)}px sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(text, width / 2, height / 2, width * 0.92)
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      textures.push(texture)
      const mat = new THREE.MeshBasicMaterial({ map: texture })
      materials.push(mat)
      return mat
    }
    box(scene, [13, 0.15, 14], [0, -0.08, 0], material("#aabfbb"))
    const grid = new THREE.GridHelper(14, 18, "#809c98", "#9eb3af")
    grid.position.y = 0.005
    scene.add(grid)
    box(scene, [13, 4, 0.15], [0, 2, -3.9], white)
    box(scene, [0.15, 4, 14], [-6.1, 2, 0], white)
    box(scene, [0.15, 4, 14], [6.1, 2, 0], white)
    box(scene, [12, 0.07, 0.04], [0, 1.05, -3.8], teal)
    box(
      scene,
      [3.4, 0.55, 0.07],
      [-2.6, 2.7, -3.78],
      label("HEMOFORGE  /  CELL CULTURE"),
    )
    box(scene, [2.1, 0.5, 0.07], [2.5, 2.7, -3.78], label("VIRTUAL LAB 01"))
    const windowMat = material("#b2e2e7", 0.15, 0.15)
    for (let i = 0; i < 3; i++) {
      box(scene, [0.08, 1.8, 1.5], [-5.98, 2.35, -2 + i * 1.7], dark)
      box(scene, [0.09, 1.65, 1.35], [-5.92, 2.35, -2 + i * 1.7], windowMat)
    }
    for (const x of [-3, 3]) {
      box(scene, [3, 0.06, 0.55], [x, 3.8, -0.2], white)
      box(scene, [2.8, 0.02, 0.4], [x, 3.76, -0.2], material("#ffffff"))
    }
    function bench(x: number, width: number) {
      box(scene, [width, 0.12, 1.35], [x, 0.95, -1.4], dark)
      box(scene, [width - 0.1, 0.82, 1.15], [x, 0.47, -1.4], white)
      for (let i = -1; i <= 1; i++) {
        box(
          scene,
          [width / 3 - 0.06, 0.66, 0.03],
          [x + (i * width) / 3, 0.5, -0.8],
          material("#c7d8d2"),
        )
        box(
          scene,
          [0.22, 0.035, 0.04],
          [x + (i * width) / 3, 0.72, -0.77],
          steel,
        )
      }
    }
    bench(-2, 3.5)
    bench(2, 3.5)
    const reactor = new THREE.Group()
    reactor.position.set(-1.8, 1.03, -1.35)
    scene.add(reactor)
    cylinder(reactor, 0.48, 0.5, 0.16, [0, 0.08, 0], steel)
    const glass = new THREE.MeshPhysicalMaterial({
      color: "#bde6e4",
      transparent: true,
      opacity: 0.24,
      roughness: 0.1,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    materials.push(glass)
    cylinder(reactor, 0.43, 0.43, 0.86, [0, 0.59, 0], glass)
    const fluid = cylinder(
      reactor,
      0.39,
      0.39,
      0.59,
      [0, 0.47, 0],
      material("#d99372", 0.1, 0.22),
    )
    cylinder(reactor, 0.49, 0.49, 0.13, [0, 1.06, 0], steel)
    cylinder(reactor, 0.12, 0.12, 0.3, [0, 1.27, 0], dark)
    cylinder(reactor, 0.025, 0.025, 0.85, [0, 0.64, 0], steel)
    const impeller = box(reactor, [0.6, 0.04, 0.07], [0, 0.4, 0], steel)
    for (const x of [-0.34, 0.34])
      cylinder(reactor, 0.035, 0.035, 0.24, [x, 1.2, 0], teal)
    const tube = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.34, 1.25, 0),
      new THREE.Vector3(-0.7, 1.6, 0),
      new THREE.Vector3(-0.95, 0.4, 0.12),
    ])
    const tubeMesh = new THREE.Mesh(
      new THREE.TubeGeometry(tube, 28, 0.025, 8, false),
      teal,
    )
    reactor.add(tubeMesh)
    box(
      reactor,
      [0.32, 0.21, 0.08],
      [0.03, 0.85, 0.45],
      label("500 mL", 512, 180),
    )
    box(
      scene,
      [0.72, 0.5, 0.1],
      [-3.05, 1.38, -1.25],
      label("BIOREACTOR", 512, 240),
    )
    const analyzer = new THREE.Group()
    analyzer.position.set(1.9, 1.02, -1.35)
    scene.add(analyzer)
    box(analyzer, [1.35, 0.83, 0.8], [0, 0.44, 0], white)
    box(analyzer, [1.39, 0.12, 0.84], [0, 0.1, 0], dark)
    box(
      analyzer,
      [0.72, 0.38, 0.035],
      [0.12, 0.6, 0.42],
      label("FLEX2  /  READY", 768, 300),
    )
    const assayScreen = box(
      analyzer,
      [0.62, 0.04, 0.04],
      [0.12, 0.47, 0.445],
      teal,
    )
    box(analyzer, [0.24, 0.22, 0.3], [-0.42, 0.22, 0.46], dark)
    box(
      analyzer,
      [0.98, 0.12, 0.04],
      [0.08, 0.25, 0.42],
      label("BioProfile FLEX2", 1024, 160, "#435a60", "#eaf0ed"),
    )
    box(analyzer, [0.13, 0.12, 0.04], [-0.5, 0.71, 0.42], red)
    const vial = new THREE.Group()
    vial.position.set(-0.42, 0.4, 0.5)
    analyzer.add(vial)
    cylinder(vial, 0.035, 0.035, 0.14, [0, 0, 0], material("#e7b49b"))
    cylinder(vial, 0.04, 0.04, 0.035, [0, 0.09, 0], teal)
    for (let i = 0; i < 4; i++) {
      cylinder(
        scene,
        0.08,
        0.08,
        0.24,
        [-3.5 + i * 0.19, 1.14, -1.9],
        material(i % 2 ? "#c0ded5" : "#eee2b2"),
      )
      cylinder(scene, 0.085, 0.085, 0.04, [-3.5 + i * 0.19, 1.28, -1.9], teal)
    }
    const hands = new THREE.Group()
    camera.add(hands)
    for (const side of [-1, 1]) {
      const hand = new THREE.Group()
      hand.position.set(side * 0.18, -0.23, -0.65)
      hand.rotation.set(-0.45, 0, side * -0.18)
      box(hand, [0.13, 0.16, 0.08], [0, 0, 0], glove)
      box(hand, [0.14, 0.26, 0.09], [0, -0.2, 0], white)
      for (let finger = 0; finger < 4; finger++) {
        const digit = cylinder(
          hand,
          0.016,
          0.019,
          0.12 - Math.abs(1.5 - finger) * 0.012,
          [-0.048 + finger * 0.031, 0.12, 0],
          glove,
        )
        digit.rotation.x = -0.25
      }
      const thumb = cylinder(
        hand,
        0.022,
        0.025,
        0.1,
        [side * 0.085, 0.015, 0.015],
        glove,
      )
      thumb.rotation.z = side * -0.6
      hands.add(hand)
    }
    const arrowCanvas = document.createElement("canvas")
    arrowCanvas.width = arrowCanvas.height = 128
    const ac = arrowCanvas.getContext("2d")!
    ac.fillStyle = "#f3d58a"
    ac.beginPath()
    ac.arc(64, 64, 54, 0, Math.PI * 2)
    ac.fill()
    ac.fillStyle = "#163a3d"
    ac.font = "bold 85px sans-serif"
    ac.textAlign = "center"
    ac.textBaseline = "middle"
    ac.fillText("↓", 64, 64)
    const arrowTexture = new THREE.CanvasTexture(arrowCanvas)
    textures.push(arrowTexture)
    const arrowMaterial = new THREE.SpriteMaterial({
      map: arrowTexture,
      depthTest: false,
    })
    materials.push(arrowMaterial)
    const arrow = new THREE.Sprite(arrowMaterial)
    arrow.scale.set(0.48, 0.48, 1)
    scene.add(arrow)
    const targetPosition = new THREE.Vector3(),
      look = new THREE.Vector3(0, 1.3, -1.35),
      targetLook = look.clone()
    const loader = new GLTFLoader()
    let disposed = false
    function prop(name: string, pos: number[], scale: number, rotation = 0) {
      loader.load(
        `/virtual-lab/kenney/${name}.glb`,
        (gltf) => {
          if (disposed) {
            disposeObject(gltf.scene)
            return
          }
          const object = gltf.scene
          object.position.set(...pos as [number, number, number])
          object.scale.setScalar(scale)
          object.rotation.y = rotation
          object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true
              child.receiveShadow = true
            }
          })
          scene.add(object)
        },
        undefined,
        () => {
          /* Decorative props may fail without blocking the assay. */
        },
      )
    }
    prop("bookcaseClosedWide", [4.5, 0, -3], 1.5, -0.4)
    prop("chairDesk", [3.8, 0, 0.3], 1.25, -1)
    prop("computerScreen", [-3, 1.04, -2], 0.7)
    function resize() {
      const { width, height } = container.getBoundingClientRect()
      renderer.setSize(width, height)
      camera.aspect = width / Math.max(1, height)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()
    const ray = new THREE.Raycaster(),
      mouse = new THREE.Vector2()
    let drag: {
      x: number
      y: number
      moved: boolean
    } | null = null
    let yaw = 0,
      pitch = 0,
      previousStation = props.station,
      last = performance.now(),
      elapsed = 0
    function down(event: PointerEvent) {
      drag = { x: event.clientX, y: event.clientY, moved: false }
      renderer.domElement.setPointerCapture(event.pointerId)
    }
    function move(event: PointerEvent) {
      if (!drag) return
      const dx = event.clientX - drag.x,
        dy = event.clientY - drag.y
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
      yaw = THREE.MathUtils.clamp(yaw - dx * 0.003, -0.65, 0.65)
      pitch = THREE.MathUtils.clamp(pitch + dy * 0.002, -0.3, 0.3)
      drag.x = event.clientX
      drag.y = event.clientY
    }
    function up(event: PointerEvent) {
      if (drag && !drag.moved) {
        const rect = renderer.domElement.getBoundingClientRect()
        mouse.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          (-(event.clientY - rect.top) / rect.height) * 2 + 1,
        )
        ray.setFromCamera(mouse, camera)
        if (arrow.visible && ray.intersectObject(arrow).length)
          current.current.onInteract()
      }
      drag = null
    }
    function lost(event: Event) {
      event.preventDefault()
      current.current.onError(
        "WebGL context lost. Reload the page; the culture clock is paused.",
      )
    }
    renderer.domElement.addEventListener("pointerdown", down)
    renderer.domElement.addEventListener("pointermove", move)
    renderer.domElement.addEventListener("pointerup", up)
    renderer.domElement.addEventListener("webglcontextlost", lost)
    let animation = 0
    function frame(now: number) {
      if (disposed) return
      const delta = Math.max(0, (now - last) / 1000)
      last = now
      const state = current.current
      if (state.station !== previousStation) {
        yaw = pitch = 0
        previousStation = state.station
      }
      const close = state.station !== "overview",
        flex = state.station === "flex2"
      targetPosition.set(
        close ? (flex ? 1.9 : -1.8) : 0,
        close ? 1.75 : 1.9,
        close ? 1.0 : Math.max(6.5, 5.8 / Math.max(0.45, camera.aspect)),
      )
      targetLook.set(close ? (flex ? 1.9 : -1.8) : 0, flex ? 1.5 : 1.65, -1.4)
      camera.position.lerp(targetPosition, Math.min(1, delta * 4))
      look.lerp(targetLook, Math.min(1, delta * 4))
      camera.lookAt(look.clone().add(new THREE.Vector3(yaw * 3, -pitch * 3, 0)))
      if (state.running && document.visibilityState === "visible")
        elapsed += Math.min(delta, 0.25)
      impeller.rotation.y = elapsed * 3
      fluid.rotation.y = elapsed * 0.12
      fluid.scale.y = state.volumeMl / 500
      fluid.position.y = 0.175 + 0.295 * fluid.scale.y
      hands.position.y = Math.sin(elapsed * 2) * 0.007
      hands.rotation.x =
        state.phase === "analyzing" ? Math.sin(elapsed * 3) * 0.035 : 0
      vial.visible = ["loaded", "analyzing", "complete"].includes(state.phase)
      assayScreen.scale.x =
        state.phase === "analyzing" ? Math.max(0.03, state.progress) : 1
      const atFlex = state.phase === "collected" || state.phase === "loaded"
      arrow.position.set(
        atFlex ? 1.9 : -1.8,
        2.5 + Math.sin(now / 350) * 0.05,
        -1.3,
      )
      arrow.visible = state.phase !== "analyzing"
      renderer.render(scene, camera)
      // Advancing occurs only after a frame was actually rendered.
      state.onFrame(delta)
      animation = requestAnimationFrame(frame)
    }
    animation = requestAnimationFrame(frame)
    function disposeObject(root: THREE.Object3D) {
      root.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.LineSegments ||
          object instanceof THREE.Sprite
        ) {
          if ("geometry" in object) object.geometry?.dispose()
          const list = Array.isArray(object.material)
            ? object.material
            : [object.material]
          for (const mat of list) {
            for (const value of Object.values(mat))
              if (value instanceof THREE.Texture) value.dispose()
            mat.dispose()
          }
        }
      })
    }
    return () => {
      disposed = true
      cancelAnimationFrame(animation)
      observer.disconnect()
      renderer.domElement.removeEventListener("pointerdown", down)
      renderer.domElement.removeEventListener("pointermove", move)
      renderer.domElement.removeEventListener("pointerup", up)
      renderer.domElement.removeEventListener("webglcontextlost", lost)
      disposeObject(scene)
      for (const texture of textures) texture.dispose()
      for (const mat of materials) mat.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])
  return <div ref={host} className="vl-canvas" />
}
