import { useEffect, useRef } from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import type { LabSnapshot } from "./lab-session"
import { lastSensor, sensorUsable } from "./biostat-data"
import { liquidHeight, renderedSeconds, stirrerAngle } from "./biostat-animation"
import { instrumentPresentation } from "./biopat-instrument"
import { canInspect, InspectionClock } from "./operator-hands"

export type LabAsset = "biostat" | "trace" | "viamass" | "laboratory" | "hands"
export type LabAssetState = "loading" | "blender" | "fallback"

interface Props {
  station: "overview" | "bioreactor" | "trace" | "viamass"
  snapshot: LabSnapshot | null
  connected: boolean
  onAssetState: (asset: LabAsset, state: LabAssetState) => void
  onPerformance: (fps: number, quality: "high" | "balanced") => void
  inspectionRequest: number
  reducedMotion: boolean
  onHandState: (state: string) => void
  onFrame: (delta: number) => void
  onInteract: () => void
  onError: (message: string) => void
}

// Original Blender CC0 equipment and laboratory, with independent fallbacks.
export default function BiostatScene(props: Props) {
  const host = useRef<HTMLDivElement>(null)
  const current = useRef(props)
  current.current = props
  useEffect(() => {
    const container = host.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      current.current.onError(
        "WebGL tidak tersedia. Aktifkan hardware acceleration.",
      )
      return
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.95
    renderer.domElement.setAttribute("role", "img")
    renderer.domElement.setAttribute(
      "aria-label",
      "Blender bioprocess laboratory with cabinets, washstation, clean work enclosure, incubator, centrifuge and gas bank; BIOSTAT cutaway, Trace and ViaMass with live virtual readouts",
    )
    container.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color("#e0e7e7")
    scene.fog = new THREE.Fog("#e0e7e7", 14, 32)
    // Locally generated studio reflections: no HDRI download or external request.
    const pmrem = new THREE.PMREMGenerator(renderer)
    const roomEnvironment = new RoomEnvironment()
    const environment = pmrem.fromScene(roomEnvironment, 0.04)
    scene.environment = environment.texture
    scene.environmentIntensity = 0.7
    roomEnvironment.dispose()
    pmrem.dispose()
    const camera = new THREE.PerspectiveCamera(48, 1, 0.05, 40)
    camera.position.set(1, 2.65, 8)
    scene.add(camera)
    scene.add(new THREE.HemisphereLight(0xf1faff, 0x71818d, 0.95))
    const key = new THREE.DirectionalLight(0xfff8e8, 2.1)
    key.position.set(-3, 7, 5)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.left = key.shadow.camera.bottom = -7
    key.shadow.camera.right = key.shadow.camera.top = 7
    key.shadow.bias = -0.00015
    key.shadow.normalBias = 0.025
    scene.add(key)
    const fill = new THREE.PointLight(0x73dbe8, 7, 10)
    fill.position.set(0, 3, -2)
    scene.add(fill)
    function mat(color: string, metalness = 0, roughness = 0.5) {
      return new THREE.MeshStandardMaterial({ color, metalness, roughness })
    }
    const white = mat("#eef3f2"),
      steel = mat("#9baeb6", 0.8, 0.22),
      dark = mat("#173744", 0.4)
    const teal = mat("#0e929c", 0.4),
      blue = mat("#3b9dcf", 0.3),
      amber = mat("#d2a55d", 0.4)
    const violet = mat("#9363b0", 0.3),
      green = mat("#77af8f", 0.2)
    function mesh(
      parent: THREE.Object3D,
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      xyz: number[],
    ) {
      const object = new THREE.Mesh(geometry, material)
      object.position.set(...xyz as [number, number, number])
      object.castShadow = object.receiveShadow = true
      parent.add(object)
      return object
    }
    const box = (
      p: THREE.Object3D,
      size: number[],
      xyz: number[],
      m: THREE.Material,
    ) =>
      mesh(
        p,
        new THREE.BoxGeometry(...size as [number, number, number]),
        m,
        xyz,
      )
    const cyl = (
      p: THREE.Object3D,
      r: number,
      h: number,
      xyz: number[],
      m: THREE.Material,
    ) => mesh(p, new THREE.CylinderGeometry(r, r, h, 40), m, xyz)
    function surface(w = 1024, h = 512) {
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")!
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      return {
        canvas,
        ctx,
        texture,
        material: new THREE.MeshBasicMaterial({ map: texture }),
      }
    }
    function plaque(
      parent: THREE.Object3D,
      text: string,
      xyz: number[],
      width = 1,
      height = 0.16,
    ) {
      const face = surface(1024, 160)
      face.ctx.fillStyle = "#143847"
      face.ctx.fillRect(0, 0, 1024, 160)
      face.ctx.fillStyle = "#e7f7f5"
      face.ctx.font = "600 62px sans-serif"
      face.ctx.textAlign = "center"
      face.ctx.textBaseline = "middle"
      face.ctx.fillText(text, 512, 80, 960)
      face.texture.needsUpdate = true
      return box(parent, [width, height, 0.025], xyz, face.material)
    }
    const roomFallback = new THREE.Group()
    scene.add(roomFallback)
    box(roomFallback, [15, 0.1, 16], [0, -0.06, 0], mat("#afc4cb", 0.1, 0.65))
    const grid = new THREE.GridHelper(16, 16, 0xa5b8bc, 0xa5b8bc)
    grid.position.y = 0.003
    roomFallback.add(grid)
    box(roomFallback, [15, 4.5, 0.15], [0, 2.25, -4.2], white)
    box(roomFallback, [0.15, 4.5, 13], [-6, 2.25, 0], white)
    box(roomFallback, [0.15, 4.5, 13], [6, 2.25, 0], white)
    for (const x of [-4, 0, 4]) {
      box(roomFallback, [2.9, 0.07, 0.7], [x, 4.05, -0.5], dark)
      box(roomFallback, [2.75, 0.02, 0.6], [x, 4, -0.5], mat("#faffff"))
    }
    for (let i = 0; i < 4; i++) {
      box(roomFallback, [0.06, 1.5, 1.35], [-5.9, 2.5, -2.5 + i * 1.6], dark)
      box(
        roomFallback,
        [0.07, 1.38, 1.23],
        [-5.85, 2.5, -2.5 + i * 1.6],
        mat("#9dd0e0", 0.1, 0.15),
      )
    }
    plaque(
      roomFallback,
      "HEMOFORGE  /  BIOPROCESS LAB",
      [-1.6, 3.15, -4.08],
      4.2,
      0.42,
    )
    plaque(roomFallback, "ONLINE PAT  /  MONITOR 01", [3.15, 3.15, -4.08], 2.4, 0.3)
    for (const x of [-4.7, 3.7]) {
      box(roomFallback, [2.6, 0.12, 1.15], [x, 0.95, -2.7], dark)
      box(roomFallback, [2.5, 0.83, 1.05], [x, 0.46, -2.7], white)
      for (let i = -1; i <= 1; i++) {
        box(
          roomFallback,
          [0.77, 0.68, 0.025],
          [x + i * 0.82, 0.5, -2.16],
          mat("#cadbdc"),
        )
        box(roomFallback, [0.22, 0.025, 0.04], [x + i * 0.82, 0.7, -2.13], steel)
      }
    }
    const reactor = new THREE.Group()
    reactor.position.set(-1.6, 0, -0.9)
    scene.add(reactor)
    const fallback = new THREE.Group()
    reactor.add(fallback)
    cyl(fallback, 0.8, 0.16, [0, 0.35, 0], steel)
    for (const x of [-0.55, 0.55])
      for (const z of [-0.4, 0.4]) {
        cyl(fallback, 0.055, 0.3, [x, 0.18, z], steel)
        const wheel = cyl(fallback, 0.09, 0.06, [x, 0.075, z], dark)
        wheel.rotation.z = Math.PI / 2
      }
    const shell = mesh(
      fallback,
      new THREE.CylinderGeometry(
        0.75,
        0.75,
        1.5,
        48,
        1,
        true,
        Math.PI / 2,
        Math.PI,
      ),
      steel,
      [0, 1.2, 0],
    )
    shell.material.side = THREE.DoubleSide
    const bagMat = new THREE.MeshPhysicalMaterial({
      color: "#c7eef2",
      roughness: 0.15,
      transparent: true,
      opacity: 0.17,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    cyl(fallback, 0.655, 1.48, [0, 1.2, 0], bagMat)
    const liquidMat = new THREE.MeshPhysicalMaterial({
      color: "#b96855",
      roughness: 0.23,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    let liquid: THREE.Object3D = cyl(fallback, 0.625, 1.0, [0, 0.98, 0], liquidMat)
    let blenderLoaded = false
    for (const y of [0.45, 1.95]) {
      const ring = mesh(
        fallback,
        new THREE.TorusGeometry(0.73, 0.045, 10, 64),
        steel,
        [0, y, 0],
      )
      ring.rotation.x = Math.PI / 2
    }
    for (const x of [-0.7, 0.7]) cyl(fallback, 0.035, 1.55, [x, 1.2, 0.08], dark)
    cyl(fallback, 0.7, 0.11, [0, 2, 0], steel)
    cyl(fallback, 0.14, 0.4, [0, 2.25, 0], dark)
    let impellers: THREE.Object3D = new THREE.Group()
    fallback.add(impellers)
    cyl(impellers, 0.024, 1.65, [0, 1.2, 0], steel)
    for (const y of [0.7, 1.22])
      for (let i = 0; i < 3; i++) {
        const blade = new THREE.Group()
        blade.position.y = y
        blade.rotation.y = (i * Math.PI * 2) / 3
        const wing = box(blade, [0.36, 0.045, 0.12], [0.19, 0, 0], steel)
        wing.rotation.x = 0.35
        impellers.add(blade)
      }
    const sparger = mesh(
      fallback,
      new THREE.TorusGeometry(0.35, 0.018, 8, 48),
      blue,
      [0, 0.52, 0],
    )
    sparger.rotation.x = Math.PI / 2
    for (const [i, x] of [-0.42, -0.2, 0.28].entries()) {
      cyl(
        fallback,
        0.025,
        0.8,
        [x, 1.7, 0.1],
        i === 0 ? teal : i === 1 ? blue : amber,
      )
      cyl(fallback, 0.055, 0.16, [x, 2.12, 0.1], dark)
    }
    const viaProbe = cyl(fallback, 0.09, 0.26, [0.58, 0.8, 0.29], amber)
    viaProbe.rotation.z = Math.PI / 2
    const fallbackViaPlaque = plaque(fallback, "ViaMass / pF per cm", [0.32, 0.62, 0.65], 0.72, 0.13)
    plaque(fallback, "STR 50 / GEN 2", [0, 1.97, 0.75], 0.95, 0.16)
    for (let i = 0; i < 6; i++) {
      const y = 0.62 + i * 0.2
      box(fallback, [0.06, 0.012, 0.02], [-0.59, y, 0.32], white)
    }
    const bubbleMat = new THREE.MeshStandardMaterial({
      color: "#adf2ff",
      transparent: true,
      opacity: 0.7,
      emissive: "#166581",
      emissiveIntensity: 0.3,
    })
    const bubbles = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.014, 8, 6),
      bubbleMat,
      100,
    )
    reactor.add(bubbles)
    const cells = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.018, 8, 6),
      mat("#9b3945", 0, 0.8),
      90,
    )
    reactor.add(cells)
    const marker = new THREE.Object3D()
    const tower = new THREE.Group()
    tower.position.set(0.15, 0, -1.05)
    scene.add(tower)
    box(tower, [0.7, 0.17, 0.8], [0, 0.12, 0], steel)
    box(tower, [0.55, 1.65, 0.6], [0, 1, 0], white)
    box(tower, [0.69, 0.65, 0.1], [0, 1.91, 0.3], dark)
    const controllerScreen = surface()
    const controllerDisplay = box(tower, [0.63, 0.54, 0.025], [0, 1.92, 0.36], controllerScreen.material)
    plaque(tower, "DCU / VIRTUAL AUTO", [0, 1.52, 0.33], 0.57, 0.12)
    const rotorGroups: THREE.Group[] = []
    for (let i = 0; i < 3; i++) {
      const rotor = new THREE.Group()
      rotor.position.set(0, 0.5 + i * 0.29, 0.34)
      const disk = cyl(rotor, 0.095, 0.045, [0, 0, 0], dark)
      disk.rotation.x = Math.PI / 2
      for (let j = 0; j < 3; j++) {
        const a = (j * Math.PI * 2) / 3
        const bolt = cyl(
          rotor,
          0.025,
          0.05,
          [Math.cos(a) * 0.061, Math.sin(a) * 0.061, 0.025],
          i === 0 ? green : i === 1 ? teal : violet,
        )
        bolt.rotation.x = Math.PI / 2
      }
      tower.add(rotor)
      rotorGroups.push(rotor)
    }
    const trace = new THREE.Group()
    trace.position.set(2.05, 1.03, -1.5)
    scene.add(trace)
    box(roomFallback, [1.65, 0.09, 1.1], [2.05, 0.98, -1.5], dark)
    for (const x of [1.4, 2.7]) cyl(roomFallback, 0.035, 0.95, [x, 0.48, -1.65], steel)
    const traceFallback = new THREE.Group()
    trace.add(traceFallback)
    box(traceFallback, [1.3, 0.68, 0.74], [0, 0.38, 0], white)
    box(traceFallback, [1.34, 0.12, 0.78], [0, 0.08, 0], dark)
    const traceScreen = surface()
    box(traceFallback, [0.79, 0.41, 0.028], [-0.13, 0.42, 0.386], traceScreen.material)
    const traceLampMat = new THREE.MeshStandardMaterial({
      color: "#50d5aa",
      emissive: "#50d5aa",
      emissiveIntensity: 0.7,
    })
    const lamp = cyl(traceFallback, 0.03, 0.04, [0.49, 0.59, 0.39], traceLampMat)
    lamp.rotation.x = Math.PI / 2
    for (const x of [-0.4, -0.1, 0.2]) {
      cyl(traceFallback, 0.05, 0.2, [x, 0.86, 0], bagMat)
      cyl(traceFallback, 0.055, 0.035, [x, 0.98, 0], teal)
    }
    plaque(traceFallback, "BioPAT TRACE", [0, 0.16, 0.4], 0.95, 0.12)
    plaque(traceFallback, "GLUCOSE / LACTATE", [0, -0.1, 0.5], 1.1, 0.13)
    // Separate visible paths for gas, sampling/return, feed and filtrate.
    const paths: {
      curve: THREE.CatmullRomCurve3
      particles: THREE.Mesh[]
      kind: string
    }[] = []
    function circuit(points: number[][], color: THREE.Material, kind: string) {
      const curve = new THREE.CatmullRomCurve3(
        points.map((p) => new THREE.Vector3(...p as [number, number, number])),
      )
      mesh(
        scene,
        new THREE.TubeGeometry(curve, 48, 0.018, 7, false),
        color,
        [0, 0, 0],
      )
      const particles = Array.from({ length: 8 }, () =>
        mesh(scene, new THREE.SphereGeometry(0.027, 7, 5), color, [0, 0, 0]),
      )
      paths.push({ curve, particles, kind })
    }
    circuit(
      [
        [-3.5, 0.2, -1.9],
        [-3.2, 2.4, -1.6],
        [-2.0, 2.55, -0.9],
        [-1.8, 0.55, -0.8],
      ],
      blue,
      "gas",
    )
    circuit(
      [
        [-1.1, 1.2, -0.6],
        [-0.8, 2.7, -1.4],
        [0.7, 2.75, -1.7],
        [2.13, 1.21, -1.02],
      ],
      teal,
      "trace",
    )
    circuit(
      [
        [2.50, 1.21, -1.02],
        [2.9, 2.5, -1.6],
        [0.6, 2.95, -2],
        [-1.4, 2.1, -1],
      ],
      teal,
      "trace",
    )
    circuit(
      [
        [-3.5, 0.9, 0],
        [-3, 2.5, -0.4],
        [-2, 2.6, -0.4],
        [-1.6, 2.05, -0.7],
      ],
      green,
      "feed",
    )
    circuit(
      [
        [-1.1, 0.7, -0.5],
        [-0.5, 0.6, 0],
        [0.65, 0.6, 0],
        [1.0, 0.45, 0.5],
      ],
      violet,
      "waste",
    )
    for (const [x, color, text] of [
      [-3.5, green, "MEDIUM"],
      [1, violet, "RETENTION SKID"],
    ] as const) {
      const bag = box(scene, [0.42, 0.62, 0.2], [x, 0.55, 0.2], color)
      bag.rotation.z = x < 0 ? 0.05 : -0.05
      plaque(scene, text, [x, 0.6, 0.32], 0.65, 0.13)
      cyl(scene, 0.022, 1.5, [x - 0.32, 0.75, 0], steel)
      cyl(scene, 0.25, 0.04, [x - 0.32, 0.03, 0], steel)
    }
    for (let i = 0; i < 3; i++) {
      cyl(
        roomFallback,
        0.13,
        1.3,
        [-3.7 + i * 0.32, 0.68, -1.85],
        i === 1 ? dark : steel,
      )
      cyl(roomFallback, 0.04, 0.15, [-3.7 + i * 0.32, 1.4, -1.85], blue)
    }
    plaque(roomFallback, "AIR / O2 / N2", [-3.4, 0.8, -1.68], 0.9, 0.14)
    // A ViaMass electronics box and lead, distinct from the glucose/lactate fluid circuit.
    const fallbackViaBox = box(fallback, [0.27, 0.34, 0.2], [0.82, 1.14, 0.12], dark)
    const viaScreen = surface()
    const fallbackViaDisplay = box(reactor, [0.52, 0.28, 0.025], [0.82, 1.16, 0.24], viaScreen.material)
    const fallbackViaLabel = plaque(reactor, "VIAMASS", [0.82, 0.94, 0.23], 0.45, 0.1)
    const wire = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.9, 0.8, -0.61),
      new THREE.Vector3(-0.5, 1, -0.6),
      new THREE.Vector3(-0.78, 1.2, -0.78),
    ])
    const fallbackViaWire = mesh(
      scene,
      new THREE.TubeGeometry(wire, 20, 0.015, 6, false),
      amber,
      [0, 0, 0],
    )
    const hands = new THREE.Group()
    camera.add(hands)
    const handFallback = new THREE.Group()
    hands.add(handFallback)
    const glove = mat("#a4c9dd", 0, 0.78)
    for (const side of [-1, 1]) {
      const hand = new THREE.Group()
      hand.position.set(side * 0.29, -0.32, -0.7)
      hand.rotation.set(-0.7, side * 0.1, side * -0.25)
      box(hand, [0.115, 0.135, 0.065], [0, 0, 0], glove)
      box(hand, [0.12, 0.24, 0.075], [0, -0.18, 0], white)
      for (let finger = 0; finger < 4; finger++) {
        const digit = cyl(
          hand,
          0.014,
          0.095,
          [-0.041 + finger * 0.027, 0.105, 0],
          glove,
        )
        digit.rotation.x = -0.25
        cyl(hand, 0.014, 0.05, [-0.041 + finger * 0.027, 0.17, -0.014], glove)
      }
      const thumb = cyl(hand, 0.019, 0.09, [side * 0.075, 0.02, 0.015], glove)
      thumb.rotation.z = side * -0.7
      handFallback.add(hand)
    }
    const arrowFace = surface(128, 128)
    arrowFace.ctx.fillStyle = "#ecd299"
    arrowFace.ctx.beginPath()
    arrowFace.ctx.arc(64, 64, 56, 0, Math.PI * 2)
    arrowFace.ctx.fill()
    arrowFace.ctx.fillStyle = "#163c49"
    arrowFace.ctx.font = "bold 80px sans-serif"
    arrowFace.ctx.textAlign = "center"
    arrowFace.ctx.fillText("↓", 64, 88)
    arrowFace.texture.needsUpdate = true
    const arrow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: arrowFace.texture, depthTest: false }),
    )
    arrow.position.set(0.15, 2.6, -0.7)
    arrow.scale.setScalar(0.35)
    scene.add(arrow)
    let disposed = false,
      contextLost = false
    function disposeObject(root: THREE.Object3D) {
      root.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Sprite ||
          object instanceof THREE.LineSegments
        ) {
          if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose()
          if ("geometry" in object) object.geometry?.dispose()
          for (const m of Array.isArray(object.material)
            ? object.material
            : [object.material]) {
            for (const value of Object.values(m))
              if (value instanceof THREE.Texture) value.dispose()
            m.dispose()
          }
        }
      })
    }
    const loader = new GLTFLoader()
    let legacyHeroVia: THREE.Object3D | undefined
    let viaLoaded = false
    const tracePumps: THREE.Object3D[] = []
    let traceStatus: THREE.Object3D | undefined
    let viaStatus: THREE.Object3D | undefined
    let traceDisplay: THREE.Object3D | undefined, viaDisplay: THREE.Object3D | undefined
    const gloveRoots: THREE.Object3D[] = []
    const fingerBones: { bone: THREE.Object3D; rest: THREE.Quaternion; side: string; finger: string; joint: number }[] = []
    const viaFallbackObjects = [viaProbe, fallbackViaPlaque, fallbackViaBox, fallbackViaDisplay, fallbackViaLabel, fallbackViaWire]
    const prepareModel = (model: THREE.Object3D) => model.traverse(object => {
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        object.castShadow = materials.every(m => !m.transparent)
        object.receiveShadow = true
      }
    })
    const bindDisplay = (node: THREE.Mesh, face: ReturnType<typeof surface>) => {
      // Blender/glTF UVs use the opposite texture origin from procedural meshes.
      face.texture.flipY = false
      face.texture.needsUpdate = true
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose()
      node.material = face.material
    }
    for (const asset of ["biostat", "trace", "viamass", "laboratory", "hands"] as const) current.current.onAssetState(asset, "loading")
    loader.load("/virtual-lab/hands/operator-hands.glb", ({ scene: model }) => {
      if (disposed) { disposeObject(model); return }
      const roots = ["L", "R"].map(side => model.getObjectByName(`HF_Hand_${side}`))
      const joints = ["L", "R"].flatMap(side => ["Index", "Middle", "Ring", "Little", "Thumb"].flatMap(finger => [1,2,3].map(joint => ({ side, finger, joint, bone: model.getObjectByName(`HF_${side}_${finger}${joint}`) }))))
      let skins = 0
      model.traverse(object => { if (object instanceof THREE.SkinnedMesh) skins++ })
      if (roots.some(root => !root) || joints.some(item => !(item.bone instanceof THREE.Bone)) || skins < 2) {
        disposeObject(model)
        current.current.onAssetState("hands", "fallback")
        return
      }
      prepareModel(model)
      // First-person gloves never cast large foreground shadows on instruments.
      model.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = false; object.frustumCulled = false } })
      hands.add(model)
      handFallback.visible = false
      gloveRoots.push(...roots as THREE.Object3D[])
      fingerBones.push(...joints.map(item => ({ ...item, bone: item.bone!, rest: item.bone!.quaternion.clone() })))
      current.current.onAssetState("hands", "blender")
    }, undefined, () => { if (!disposed) current.current.onAssetState("hands", "fallback") })
    loader.load("/virtual-lab/laboratory/laboratory.glb", ({ scene: model }) => {
      if (disposed) { disposeObject(model); return }
      if (!model.getObjectByName("HF_Laboratory") || !model.getObjectByName("HF_Lab_Static")) {
        disposeObject(model)
        current.current.onAssetState("laboratory", "fallback")
        return
      }
      prepareModel(model)
      // Architecture and tiny background props receive shadows without making
      // a closed ceiling occlude the key light or adding shadow draw calls.
      model.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = false })
      scene.add(model)
      roomFallback.visible = false
      current.current.onAssetState("laboratory", "blender")
    }, undefined, () => { if (!disposed) current.current.onAssetState("laboratory", "fallback") })
    loader.load(
      "/virtual-lab/biostat/biostat-gen2.glb",
      ({ scene: model }) => {
        if (disposed) { disposeObject(model); return }
        const shaft = model.getObjectByName("HF_Impeller")
        const fluid = model.getObjectByName("HF_Liquid")
        legacyHeroVia = model.getObjectByName("HF_ViaMass_Legacy")
        if (!shaft || !fluid || !legacyHeroVia) {
          disposeObject(model)
          current.current.onAssetState("biostat", "fallback")
          return
        }
        prepareModel(model)
        if (viaLoaded) legacyHeroVia.visible = false
        reactor.add(model)
        fallback.visible = false
        // Rebind to exported transform nodes, not baked Blender animation.
        impellers = shaft
        liquid = fluid
        blenderLoaded = true
        current.current.onAssetState("biostat", "blender")
      },
      undefined,
      () => { if (!disposed) current.current.onAssetState("biostat", "fallback") },
    )
    loader.load("/virtual-lab/biopat/biopat-trace.glb", ({ scene: model }) => {
      if (disposed) { disposeObject(model); return }
      const display = model.getObjectByName("HF_Trace_Display")
      const pumpA = model.getObjectByName("HF_Trace_PumpA")
      const pumpB = model.getObjectByName("HF_Trace_PumpB")
      const status = model.getObjectByName("HF_Trace_Status")
      if (!(display instanceof THREE.Mesh) || !pumpA || !pumpB || !status) {
        disposeObject(model)
        current.current.onAssetState("trace", "fallback")
        return
      }
      prepareModel(model)
      bindDisplay(display, traceScreen)
      trace.add(model)
      traceFallback.visible = false
      tracePumps.push(pumpA, pumpB)
      traceStatus = status
      traceDisplay = display
      current.current.onAssetState("trace", "blender")
    }, undefined, () => { if (!disposed) current.current.onAssetState("trace", "fallback") })
    loader.load("/virtual-lab/biopat/biopat-viamass.glb", ({ scene: model }) => {
      if (disposed) { disposeObject(model); return }
      const display = model.getObjectByName("HF_ViaMass_Display")
      const status = model.getObjectByName("HF_ViaMass_Status")
      if (!(display instanceof THREE.Mesh) || !status) {
        disposeObject(model)
        current.current.onAssetState("viamass", "fallback")
        return
      }
      prepareModel(model)
      bindDisplay(display, viaScreen)
      model.position.set(0.58, 0.8, 0.29)
      reactor.add(model)
      viaLoaded = true
      viaStatus = status
      viaDisplay = display
      viaFallbackObjects.forEach(object => { object.visible = false })
      if (legacyHeroVia) legacyHeroVia.visible = false
      current.current.onAssetState("viamass", "blender")
    }, undefined, () => { if (!disposed) current.current.onAssetState("viamass", "fallback") })
    const resize = () => {
      const r = container.getBoundingClientRect()
      renderer.setSize(r.width, r.height)
      camera.aspect = r.width / Math.max(1, r.height)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()
    let drag: { x: number
y: number
moved: boolean } | null = null,
      yaw = 0,
      pitch = 0
    const ray = new THREE.Raycaster(),
      pointer = new THREE.Vector2()
    const inspection = new InspectionClock()
    let lastInspectionRequest = props.inspectionRequest, lastHandState = ""
    const inspectionTarget = () => current.current.station === "trace" ? traceDisplay : current.current.station === "viamass" ? viaDisplay : controllerDisplay
    const startInspection = () => {
      const p = current.current
      if (gloveRoots.length === 2 && !p.reducedMotion && canInspect(p.snapshot, p.connected, p.station) && inspectionTarget()) inspection.start()
    }
    function down(e: PointerEvent) {
      drag = { x: e.clientX, y: e.clientY, moved: false }
      renderer.domElement.setPointerCapture(e.pointerId)
    }
    function move(e: PointerEvent) {
      if (!drag) return
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y
      drag.moved ||= Math.abs(dx) + Math.abs(dy) > 3
      yaw = THREE.MathUtils.clamp(yaw - dx * 0.003, -0.65, 0.65)
      pitch = THREE.MathUtils.clamp(pitch + dy * 0.002, -0.25, 0.25)
      drag.x = e.clientX
      drag.y = e.clientY
    }
    function up(e: PointerEvent) {
      if (drag && !drag.moved) {
        const r = renderer.domElement.getBoundingClientRect()
        pointer.set(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          (-(e.clientY - r.top) / r.height) * 2 + 1,
        )
        ray.setFromCamera(pointer, camera)
        if (ray.intersectObject(arrow).length) current.current.onInteract()
        else {
          const target = inspectionTarget()
          if (target && ray.intersectObject(target).length) startInspection()
        }
      }
      drag = null
    }
    function lost(e: Event) {
      e.preventDefault()
      contextLost = true
      current.current.onError(
        "WebGL context lost. Muat ulang untuk melanjutkan.",
      )
    }
    renderer.domElement.addEventListener("pointerdown", down)
    renderer.domElement.addEventListener("pointermove", move)
    renderer.domElement.addEventListener("pointerup", up)
    renderer.domElement.addEventListener("webglcontextlost", lost)
    const look = new THREE.Vector3(-0.2, 1.4, -1),
      goal = new THREE.Vector3(),
      goalLook = new THREE.Vector3()
    let animation = 0,
      last = performance.now(),
      elapsed = 0,
      lastPaint = 0,
      previousStation = props.station
    let angle = 0, traceElapsed = 0, handElapsed = 0, frames = 0, measuredAt = performance.now(), quality: "high" | "balanced" = "high"
    let instrumentSnapshot: LabSnapshot | null | undefined, instrumentConnected: boolean | undefined
    let traceView = instrumentPresentation(null, "trace", false)
    let viaView = instrumentPresentation(null, "viamass", false)
    let tracePulse = 0, viaPulse = 0
    const screenWorld = new THREE.Vector3(), contactLocal = new THREE.Vector3(), tipLocal = new THREE.Vector3()
    const poseRotation = new THREE.Quaternion(), curlAxis = new THREE.Vector3(1,0,0)
    const rightIndexTip = () => fingerBones.find(item => item.side === "R" && item.finger === "Index" && item.joint === 3)?.bone
    const paintStatus = (root: THREE.Object3D | undefined, color: string, pulse: number) => root?.traverse(object => {
      if (object instanceof THREE.Mesh) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.color.set(color)
            material.emissive.set(color)
            material.emissiveIntensity = 0.3 + pulse
          }
        }
      }
    })
    function screen(
      face: ReturnType<typeof surface>,
      title: string,
      rows: string[],
      fault = false,
    ) {
      const { ctx, canvas } = face
      ctx.fillStyle = "#102b39"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = fault ? "#f4a886" : "#66dbcc"
      ctx.font = "600 44px monospace"
      ctx.fillText(title, 38, 65)
      ctx.fillStyle = "#d9eeed"
      ctx.font = "33px monospace"
      rows.forEach((row, i) => ctx.fillText(row, 38, 132 + i * 65, 950))
      face.texture.needsUpdate = true
    }
    function frame(now: number) {
      if (disposed) return
      const delta = Math.max(0, (now - last) / 1000)
      last = now
      const { station, snapshot: s, connected } = current.current
      if (instrumentSnapshot !== s || instrumentConnected !== connected) {
        const nextTrace = instrumentPresentation(s, "trace", connected)
        const nextVia = instrumentPresentation(s, "viamass", connected)
        if (nextTrace.state === "live" && nextTrace.receipt !== traceView.receipt) tracePulse = 0.6
        if (nextVia.state === "live" && nextVia.receipt !== viaView.receipt) viaPulse = 0.6
        traceView = nextTrace
        viaView = nextVia
        instrumentSnapshot = s
        instrumentConnected = connected
      }
      if (station !== previousStation) {
        yaw = pitch = 0
        previousStation = station
        inspection.reset()
      }
      const running = !!s?.running && connected && document.visibilityState === "visible" && !contextLost
      const motionSeconds = renderedSeconds(delta, running)
      if (current.current.reducedMotion) inspection.reset()
      if (lastInspectionRequest !== current.current.inspectionRequest) {
        lastInspectionRequest = current.current.inspectionRequest
        startInspection()
      }
      const inspectionAvailable = running && canInspect(s, connected, station)
      const handPose = inspection.advance(delta, inspectionAvailable)
      const handState = inspection.active && !inspectionAvailable ? "Interaksi dijeda · periksa simulasi dan sensor" : handPose.phase
      if (lastHandState !== handState) { lastHandState = handState; current.current.onHandState(handState) }
      if (station === "overview") {
        goal.set(0.1, 2.7, Math.max(9, 8 / Math.max(0.55, camera.aspect) - 1.5))
        goalLook.set(0, 1.6, -1.8)
      } else if (station === "trace") {
        goal.set(2.15, 1.9, Math.max(1.4, 1.9 / camera.aspect - 1.2))
        goalLook.set(2.0, 1.5, -1.2)
      } else if (station === "viamass") {
        goal.set(0.1, 1.65, Math.max(1.35, 0.8 / camera.aspect))
        goalLook.set(-0.8, 1.25, -0.65)
      } else {
        goal.set(-1.3, 1.8, Math.max(2.8, 1.5 / camera.aspect))
        goalLook.set(-1.55, 1.25, -0.9)
      }
      const targetDisplay = inspectionTarget()
      if (targetDisplay && handPose.lean > 0) {
        targetDisplay.updateWorldMatrix(true, false)
        targetDisplay.getWorldPosition(screenWorld)
        goal.lerp(screenWorld.clone().add(new THREE.Vector3(.02,.04,Math.max(.78,.82/Math.max(.5,camera.aspect)))), handPose.lean)
        goalLook.lerp(screenWorld, handPose.lean)
      }
      const ease = inspection.active && (!inspectionAvailable || motionSeconds === 0) ? 0 : Math.min(1, delta * 3.5)
      camera.position.lerp(goal, ease)
      look.lerp(goalLook, ease)
      camera.lookAt(look.clone().add(new THREE.Vector3(yaw * 3, -pitch * 3, 0)))
      elapsed += motionSeconds
      if (!inspection.active || inspectionAvailable) handElapsed += motionSeconds
      const idle = current.current.reducedMotion ? 0 : Math.sin(handElapsed * 1.25) * .003
      gloveRoots.forEach((root, index) => {
        const side = index === 0 ? -1 : 1
        root.position.set(side * Math.min(.21, camera.aspect*.2), -.32 + idle, -.5)
        root.rotation.set(-.95, side * -.12, side * -.1)
        if (index === 1) root.rotation.x -= handPose.reach*.16
      })
      fingerBones.forEach(({ bone, rest, side, finger, joint }) => {
        const restCurl = (finger === "Thumb" ? .18 : .22) + (joint === 2 ? .12 : 0)
        const inspectingCurl = finger === "Index" ? .015 : finger === "Thumb" ? .38 : .7 + (joint === 2 ? .22 : 0)
        const curl = restCurl + (inspectingCurl-restCurl) * handPose.reach * (side === "R" ? 1 : .16)
        bone.quaternion.copy(rest).multiply(poseRotation.setFromAxisAngle(curlAxis, -curl))
      })
      // Align the actual skinned index fingertip with a point in front of the
      // readout. The hand stays outside the screen and never touches fluid paths.
      const tip = rightIndexTip()
      if (targetDisplay && tip && handPose.reach > 0) {
        camera.updateWorldMatrix(true, true)
        targetDisplay.getWorldPosition(contactLocal)
        contactLocal.add(new THREE.Vector3(.09,-.075,.045-handPose.tap*.012))
        camera.worldToLocal(contactLocal)
        tipLocal.set(0,.021,0)
        tip.localToWorld(tipLocal)
        camera.worldToLocal(tipLocal)
        gloveRoots[1].position.addScaledVector(contactLocal.sub(tipLocal), handPose.reach)
      }
      if (traceView.flowing) traceElapsed += motionSeconds
      tracePumps.forEach((pump, index) => { pump.rotation.z = traceElapsed * (index === 0 ? 3 : -3) })
      tracePulse = traceView.state === "live" ? Math.max(0, tracePulse - motionSeconds * 2) : 0
      viaPulse = viaView.state === "live" ? Math.max(0, viaPulse - motionSeconds * 2) : 0
      paintStatus(traceStatus, traceView.color, tracePulse)
      paintStatus(viaStatus, viaView.color, viaPulse)
      const rpm = s?.controller?.outputs.stirrer_rpm ?? 100
      angle = stirrerAngle(angle, rpm, motionSeconds)
      impellers.rotation.y = angle
      const height = liquidHeight(s?.working_volume_ml ?? 12500)
      liquid.scale.y = height
      if (!blenderLoaded) liquid.position.y = 0.48 + height / 2
      for (let i = 0; i < 100; i++) {
        const f = (elapsed * 0.38 + i / 100) % 1,
          angle = i * 2.399 + elapsed * 0.3
        marker.position.set(
          Math.cos(angle) * (0.12 + (i % 7) * 0.045),
          0.5 + f * height * 0.92,
          Math.sin(angle) * (0.12 + (i % 7) * 0.045),
        )
        marker.scale.setScalar(0.5 + f * 0.6)
        marker.updateMatrix()
        bubbles.setMatrixAt(i, marker.matrix)
      }
      bubbles.instanceMatrix.needsUpdate = true
      for (let i = 0; i < 90; i++) {
        const a = i * 2.399 + elapsed * (0.22 + (i % 5) * 0.03),
          r = 0.16 + (i % 9) * 0.045
        marker.position.set(
          Math.cos(a) * r,
          0.53 + ((i * 0.618 + elapsed * 0.08) % 1) * height * 0.85,
          Math.sin(a) * r,
        )
        marker.scale.set(1, 0.45, 1)
        marker.updateMatrix()
        cells.setMatrixAt(i, marker.matrix)
      }
      cells.instanceMatrix.needsUpdate = true
      const transferring = s?.active_intervention?.status === "executing"
      rotorGroups.forEach((rotor, i) => {
        rotor.rotation.z = elapsed * (i === 1 || transferring ? 3 : 0.1)
      })
      paths.forEach(({ curve, particles, kind }) =>
        particles.forEach((particle, i) => {
          particle.visible =
            !!s &&
            (kind === "gas" ||
              (kind === "trace" && traceView.flowing) ||
              (transferring &&
                (kind === "feed" ||
                  s.active_intervention?.kind === "medium_exchange")))
          particle.position.copy(
            curve.getPoint(((kind === "trace" ? traceElapsed : elapsed) * 0.18 + i / particles.length) % 1),
          )
        }),
      )
      traceLampMat.color.set(traceView.color)
      traceLampMat.emissive.copy(traceLampMat.color)
      handFallback.position.y = idle
      arrow.visible =
        !!s && !s.active_intervention && s.culture_hours < s.end_hour
      arrow.position.y = 2.6 + Math.sin(now / 400) * 0.035
      if (document.visibilityState === "visible" && now - lastPaint > 500) {
        lastPaint = now
        const core = s ? lastSensor(s, "core") : null
        const pv = (key: string, digits: number) =>
          s && sensorUsable(s, core)
            ? (core!.channels[key]?.toFixed(digits) ?? "--")
            : "--"
        screen(
          controllerScreen,
          `DCU | ${s?.controller?.mode ?? "READY"}`,
          [
            `pH   ${pv("ph", 2)}  SP ${s?.controller?.setpoints.ph.toFixed(2) ?? "7.30"}`,
            `DO   ${pv("dissolved_oxygen", 1)}% SP ${s?.controller?.setpoints.dissolved_oxygen ?? 40}%`,
            `TEMP ${pv("temperature", 1)} C SP ${s?.controller?.setpoints.temperature ?? 37}`,
            `STIR ${rpm.toFixed(0)} rpm`,
            `${(s?.working_volume_ml ?? 12500) / 1000} L | ${s?.culture_hours.toFixed(2) ?? "0.00"} h`,
            `O2 OUT ${s?.controller?.outputs.oxygen_percent.toFixed(1) ?? "21.0"}%`,
          ],
          !!s?.sensor_faults?.includes("core"),
        )
        screen(
          traceScreen,
          "BioPAT TRACE / VIRTUAL",
          traceView.rows,
          traceView.state !== "live",
        )
        screen(
          viaScreen,
          "BioPAT VIAMASS / VIRTUAL",
          viaView.rows,
          viaView.state !== "live",
        )
      }
      if (!contextLost && document.visibilityState === "visible") {
        renderer.render(scene, camera)
        current.current.onFrame(delta)
        frames++
        if (now - measuredAt >= 2000) {
          const fps = frames * 1000 / (now - measuredAt)
          if (fps < 32 && quality === "high") {
            quality = "balanced"
            renderer.setPixelRatio(Math.min(devicePixelRatio, 1))
            resize()
          }
          current.current.onPerformance(Math.round(fps), quality)
          frames = 0
          measuredAt = now
        }
      } else {
        frames = 0
        measuredAt = now
      }
      animation = requestAnimationFrame(frame)
    }
    animation = requestAnimationFrame(frame)
    return () => {
      disposed = true
      cancelAnimationFrame(animation)
      observer.disconnect()
      renderer.domElement.removeEventListener("pointerdown", down)
      renderer.domElement.removeEventListener("pointermove", move)
      renderer.domElement.removeEventListener("pointerup", up)
      renderer.domElement.removeEventListener("webglcontextlost", lost)
      disposeObject(scene)
      environment.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])
  return <div ref={host} className="vl-canvas" />
}
