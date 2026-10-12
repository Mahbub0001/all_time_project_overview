import * as THREE from "three";

interface ProjectItem {
  slug: string;
  title: string;
  no: number;
  url: string;
  category: string;
}

const baseProjects: ProjectItem[] = [
  {
    slug: "space-game",
    title: "Mission Forge",
    no: 1,
    url: "https://space-game-2-virid.vercel.app/",
    category: "3D Deep Space Simulator",
  },
  {
    slug: "social-messaging",
    title: "Kotha Barta",
    no: 2,
    url: "https://social-messeging-platform.vercel.app/",
    category: "Social Messaging Platform",
  },
  {
    slug: "edu-bridge",
    title: "EduBridge",
    no: 3,
    url: "https://edu-bridge-ecru.vercel.app/",
    category: "MOOC Learning Platform",
  },
  {
    slug: "mahbub-medi-ai",
    title: "BioLens Medi-AI",
    no: 4,
    url: "https://mahbub-medi-ai.vercel.app/",
    category: "Smart Medical Analysis",
  },
  {
    slug: "nibir-ecommerce",
    title: "Nibir Commerce",
    no: 5,
    url: "https://nibir-bhuiyan-ecommerce-projects.vercel.app/",
    category: "Modern E-Commerce Suite",
  },
  {
    slug: "uftb-math-quiz",
    title: "UFTB Math Quiz",
    no: 6,
    url: "https://uftb-math-club-quiz.vercel.app/",
    category: "Live Quiz Platform",
  },
  {
    slug: "hospital-system",
    title: "Hospital ERP",
    no: 7,
    url: "https://hospital-management-system-kappa-henna.vercel.app/",
    category: "Healthcare Management",
  },
];

// Repeat the 7 live projects twice around the 14-slot 3D ring so the endless ribbon has full circumference
const projects: ProjectItem[] = [
  ...baseProjects,
  ...baseProjects.map((p, idx) => ({ ...p, no: idx + 8 })),
];

function mediaPath(file: string): string {
  return `/media/${file}`;
}

const START_VIDEO_FRACTION = 0.2;

class MediaPool {
  items: Array<{
    project: ProjectItem;
    video: HTMLVideoElement;
    poster: THREE.Texture;
    videoTexture: THREE.VideoTexture;
    ready: boolean;
    loaded: boolean;
    lastWanted: number;
    lastWantedFrame?: number;
    readonly texture: THREE.Texture;
  }>;
  enabled = true;
  manual = false;
  frame = 0;

  constructor(
    list: ProjectItem[],
    renderer: THREE.WebGLRenderer,
    manager: THREE.LoadingManager
  ) {
    const loader = new THREE.TextureLoader(manager);
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    this.items = list.map((project) => {
      const poster = loader.load(mediaPath(`${project.slug}.jpg`));
      poster.colorSpace = THREE.SRGBColorSpace;
      poster.anisotropy = maxAniso;

      const video = document.createElement("video");
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.preload = "none";
      video.setAttribute("muted", "");
      video.setAttribute("playsinline", "");

      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.colorSpace = THREE.SRGBColorSpace;
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.generateMipmaps = false;

      const item = {
        project,
        video,
        poster,
        videoTexture,
        ready: false,
        loaded: false,
        lastWanted: -Infinity,
        get texture() {
          return this.ready ? this.videoTexture : this.poster;
        },
      };

      video.addEventListener("loadedmetadata", () => {
        if (Number.isFinite(video.duration)) {
          video.currentTime = video.duration * START_VIDEO_FRACTION;
        }
      });
      video.addEventListener("playing", () => {
        item.ready = true;
      });

      return item;
    });
  }

  get(index: number) {
    return this.items[index];
  }

  prefetch(index: number) {
    const item = this.items[index];
    if (!item || item.loaded) return;
    item.loaded = true;
    item.video.preload = "auto";
    item.video.src = mediaPath(`${item.project.slug}.mp4`);
  }

  want(index: number) {
    const item = this.items[index];
    if (!item) return;
    this.prefetch(index);
    item.lastWanted = performance.now() / 1000;
    item.lastWantedFrame = this.frame;
  }

  update() {
    if (this.manual) return;
    const now = performance.now() / 1000;
    for (const item of this.items) {
      const active = this.enabled && now - item.lastWanted < 0.1;
      const { video } = item;
      if (active && video.paused && item.loaded) {
        video.play().catch(() => {});
      } else if (!active && !video.paused) {
        video.pause();
      }
    }
  }
}

class PlanarReflector extends THREE.Mesh {
  camera = new THREE.PerspectiveCamera();
  getRenderTarget: () => THREE.WebGLRenderTarget;
  dispose: () => void;

  static ReflectorShader = {
    name: "ReflectorShader",
    uniforms: {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
    },
    vertexShader: `
      uniform mat4 textureMatrix;
      varying vec4 vUv;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vUv = textureMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform sampler2D tDiffuse;
      varying vec4 vUv;
      #include <logdepthbuf_pars_fragment>
      float blendOverlay( float base, float blend ) {
        return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );
      }
      vec3 blendOverlay( vec3 base, vec3 blend ) {
        return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );
      }
      void main() {
        #include <logdepthbuf_fragment>
        vec4 base = texture2DProj( tDiffuse, vUv );
        gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  };

  constructor(geometry: THREE.BufferGeometry, options: any = {}) {
    super(geometry);
    const scope = this;
    const color =
      options.color !== undefined
        ? new THREE.Color(options.color)
        : new THREE.Color(0x7f7f7f);
    const textureWidth = options.textureWidth || 512;
    const textureHeight = options.textureHeight || 512;
    const clipBias = options.clipBias || 0;
    const shader = options.shader || PlanarReflector.ReflectorShader;
    const multisample =
      options.multisample !== undefined ? options.multisample : 4;

    const reflectorPlane = new THREE.Plane();
    const normal = new THREE.Vector3();
    const reflectorWorldPosition = new THREE.Vector3();
    const cameraWorldPosition = new THREE.Vector3();
    const rotationMatrix = new THREE.Matrix4();
    const lookAtPosition = new THREE.Vector3(0, 0, -1);
    const clipPlane = new THREE.Vector4();
    const view = new THREE.Vector3();
    const target = new THREE.Vector3();
    const q = new THREE.Vector4();
    const textureMatrix = new THREE.Matrix4();
    const virtualCamera = this.camera;

    const renderTarget = new THREE.WebGLRenderTarget(
      textureWidth,
      textureHeight,
      {
        samples: multisample,
        type: THREE.HalfFloatType,
      }
    );

    const material = new THREE.ShaderMaterial({
      name: shader.name !== undefined ? shader.name : "unspecified",
      uniforms: THREE.UniformsUtils.clone(shader.uniforms),
      fragmentShader: shader.fragmentShader,
      vertexShader: shader.vertexShader,
    });

    material.uniforms.tDiffuse.value = renderTarget.texture;
    material.uniforms.color.value = color;
    material.uniforms.textureMatrix.value = textureMatrix;
    this.material = material;

    this.onBeforeRender = function (renderer, scene, camera: any) {
      reflectorWorldPosition.setFromMatrixPosition(scope.matrixWorld);
      cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
      rotationMatrix.extractRotation(scope.matrixWorld);
      normal.set(0, 0, 1);
      normal.applyMatrix4(rotationMatrix);
      view.subVectors(reflectorWorldPosition, cameraWorldPosition);
      if (view.dot(normal) > 0) return;

      view.reflect(normal).negate();
      view.add(reflectorWorldPosition);
      rotationMatrix.extractRotation(camera.matrixWorld);
      lookAtPosition.set(0, 0, -1);
      lookAtPosition.applyMatrix4(rotationMatrix);
      lookAtPosition.add(cameraWorldPosition);
      target.subVectors(reflectorWorldPosition, lookAtPosition);
      target.reflect(normal).negate();
      target.add(reflectorWorldPosition);

      virtualCamera.position.copy(view);
      virtualCamera.up.set(0, 1, 0);
      virtualCamera.up.applyMatrix4(rotationMatrix);
      virtualCamera.up.reflect(normal);
      virtualCamera.lookAt(target);
      virtualCamera.far = camera.far;
      virtualCamera.updateMatrixWorld();
      virtualCamera.projectionMatrix.copy(camera.projectionMatrix);

      textureMatrix.set(
        0.5, 0.0, 0.0, 0.5,
        0.0, 0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0
      );
      textureMatrix.multiply(virtualCamera.projectionMatrix);
      textureMatrix.multiply(virtualCamera.matrixWorldInverse);
      textureMatrix.multiply(scope.matrixWorld);

      reflectorPlane.setFromNormalAndCoplanarPoint(
        normal,
        reflectorWorldPosition
      );
      reflectorPlane.applyMatrix4(virtualCamera.matrixWorldInverse);
      clipPlane.set(
        reflectorPlane.normal.x,
        reflectorPlane.normal.y,
        reflectorPlane.normal.z,
        reflectorPlane.constant
      );

      const projectionMatrix = virtualCamera.projectionMatrix;
      q.x =
        (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) /
        projectionMatrix.elements[0];
      q.y =
        (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) /
        projectionMatrix.elements[5];
      q.z = -1.0;
      q.w =
        (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];

      clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
      projectionMatrix.elements[2] = clipPlane.x;
      projectionMatrix.elements[6] = clipPlane.y;
      projectionMatrix.elements[10] = clipPlane.z + 1.0 - clipBias;
      projectionMatrix.elements[14] = clipPlane.w;

      scope.visible = false;
      const currentRenderTarget = renderer.getRenderTarget();
      const currentXrEnabled = renderer.xr.enabled;
      const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(renderTarget);
      renderer.state.buffers.depth.setMask(true);
      if (renderer.autoClear === false) renderer.clear();
      renderer.render(scene, virtualCamera);
      renderer.xr.enabled = currentXrEnabled;
      renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
      renderer.setRenderTarget(currentRenderTarget);
      const viewport = camera.viewport;
      if (viewport !== undefined) renderer.state.viewport(viewport);
      scope.visible = true;
    };

    this.getRenderTarget = () => renderTarget;
    this.dispose = () => {
      renderTarget.dispose();
      (scope.material as THREE.Material).dispose();
    };
  }
}

const WATER_RES = 256;
const WATER_TILE = 10;

const waterVert = `
  varying vec2 coord;
  void main() {
    coord = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const waterDropFrag = `
  const float PI = 3.141592653589793;
  uniform sampler2D tex;
  uniform vec2 center;
  uniform float radius;
  uniform float strength;
  varying vec2 coord;
  void main() {
    vec4 info = texture2D(tex, coord);
    vec2 d = coord - center;
    d -= floor(d + 0.5);
    float drop = max(0.0, 1.0 - length(d) / radius);
    drop = 0.5 - cos(drop * PI) * 0.5;
    info.r += drop * strength;
    gl_FragColor = info;
  }
`;

const waterUpdateFrag = `
  uniform sampler2D tex;
  uniform vec2 delta;
  varying vec2 coord;
  void main() {
    vec4 info = texture2D(tex, coord);
    vec2 dx = vec2(delta.x, 0.0);
    vec2 dy = vec2(0.0, delta.y);
    float average = (
      texture2D(tex, coord - dx).r +
      texture2D(tex, coord - dy).r +
      texture2D(tex, coord + dx).r +
      texture2D(tex, coord + dy).r
    ) * 0.25;
    info.g += (average - info.r) * 2.0;
    info.g *= 0.995;
    info.r += info.g;
    gl_FragColor = info;
  }
`;

const waterNormalFrag = `
  uniform sampler2D tex;
  uniform vec2 delta;
  varying vec2 coord;
  void main() {
    vec4 info = texture2D(tex, coord);
    vec3 dx = vec3(delta.x, texture2D(tex, vec2(coord.x + delta.x, coord.y)).r - info.r, 0.0);
    vec3 dy = vec3(0.0, texture2D(tex, vec2(coord.x, coord.y + delta.y)).r - info.r, delta.y);
    info.ba = normalize(cross(dy, dx)).xz;
    gl_FragColor = info;
  }
`;

class WaterSimulation {
  renderer: THREE.WebGLRenderer;
  textureA: THREE.WebGLRenderTarget;
  textureB: THREE.WebGLRenderTarget;
  dropShader: THREE.ShaderMaterial;
  updateShader: THREE.ShaderMaterial;
  normalShader: THREE.ShaderMaterial;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  plane: THREE.Mesh;
  drops: number[] = [];
  accumulator = 0;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    const opts = {
      type: THREE.HalfFloatType,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      generateMipmaps: false,
    };
    this.textureA = new THREE.WebGLRenderTarget(WATER_RES, WATER_RES, opts);
    this.textureB = new THREE.WebGLRenderTarget(WATER_RES, WATER_RES, opts);
    const delta = new THREE.Vector2(1 / WATER_RES, 1 / WATER_RES);
    const makeMat = (frag: string, extra: any = {}) =>
      new THREE.ShaderMaterial({
        uniforms: { tex: { value: null }, delta: { value: delta }, ...extra },
        vertexShader: waterVert,
        fragmentShader: frag,
        depthTest: false,
        depthWrite: false,
      });

    this.dropShader = makeMat(waterDropFrag, {
      center: { value: new THREE.Vector2() },
      radius: { value: 0.03 },
      strength: { value: 0.01 },
    });
    this.updateShader = makeMat(waterUpdateFrag);
    this.normalShader = makeMat(waterNormalFrag);
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.updateShader
    );
    this.plane.frustumCulled = false;
    this.scene.add(this.plane);
  }

  get texture() {
    return this.textureA.texture;
  }

  addDrop(x: number, z: number, radius: number, strength: number) {
    this.drops.push(x / WATER_TILE + 0.5, z / WATER_TILE + 0.5, radius, strength);
  }

  draw(mat: THREE.ShaderMaterial) {
    mat.uniforms.tex.value = this.textureA.texture;
    this.plane.material = mat;
    this.renderer.setRenderTarget(this.textureB);
    this.renderer.render(this.scene, this.camera);
    [this.textureA, this.textureB] = [this.textureB, this.textureA];
  }

  update(dt: number) {
    const prevTarget = this.renderer.getRenderTarget();
    const d = this.drops;
    for (let i = 0; i < d.length; i += 4) {
      this.dropShader.uniforms.center.value.set(d[i], d[i + 1]);
      this.dropShader.uniforms.radius.value = d[i + 2];
      this.dropShader.uniforms.strength.value = d[i + 3];
      this.draw(this.dropShader);
    }
    d.length = 0;
    this.accumulator = Math.min(this.accumulator + dt, 3 / 60);
    let stepped = false;
    while (this.accumulator >= 1 / 60) {
      this.accumulator -= 1 / 60;
      this.draw(this.updateShader);
      this.draw(this.updateShader);
      stepped = true;
    }
    if (stepped) this.draw(this.normalShader);
    this.renderer.setRenderTarget(prevTarget);
  }
}

const surfaceVert = `
  uniform mat4 textureMatrix;
  varying vec4 vReflUv;
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vReflUv = textureMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const surfaceFrag = `
  uniform vec3 color;
  uniform sampler2D tDiffuse;
  uniform sampler2D tWater;
  uniform float uTile;
  uniform float uDistort;
  uniform vec3 uGlintDir;
  uniform vec3 uGlintColor;
  uniform vec3 uDeep;
  uniform vec3 uHorizon;
  uniform float uFade;
  varying vec4 vReflUv;
  varying vec3 vWorld;

  void main() {
    float dist = length(vWorld.xz - cameraPosition.xz);
    vec2 coord = vWorld.xz / uTile + 0.5;
    vec4 info = texture2D(tWater, coord);

    for (int i = 0; i < 5; i++) {
      coord += info.ba * 0.005;
      info = texture2D(tWater, coord);
    }

    vec2 slope = info.ba * (1.0 - smoothstep(5.0, 18.0, dist));
    vec3 normal = vec3(slope.x, sqrt(max(0.0, 1.0 - dot(slope, slope))), slope.y);
    vec3 incomingRay = normalize(vWorld - cameraPosition);

    vec3 reflectedRay = reflect(incomingRay, normal);
    float fresnel = mix(0.25, 1.0, pow(1.0 - dot(normal, -incomingRay), 3.0));

    vec4 uv = vReflUv;
    uv.xy += normal.xz * uDistort * uv.w;
    vec3 reflectedColor = texture2DProj(tDiffuse, uv).rgb;
    float glint = max(0.0, dot(uGlintDir, reflectedRay));
    reflectedColor += vec3(pow(glint, 5000.0)) * vec3(10.0, 8.0, 6.0) * uGlintColor;
    reflectedColor += pow(glint, 260.0) * 0.5 * uGlintColor;
    vec3 refractedColor = uDeep;

    vec3 col = mix(refractedColor, reflectedColor, fresnel);
    col = mix(col, uHorizon, smoothstep(14.0, 90.0, dist));
    gl_FragColor = vec4(col * uFade, 1.0);
    #include <colorspace_fragment>
  }
`;

function createWaterSurface(yPos: number) {
  const geo = new THREE.PlaneGeometry(400, 400);
  const reflector = new PlanarReflector(geo, {
    textureWidth: 512,
    textureHeight: 512,
    clipBias: 0.003,
    multisample: 0,
    shader: {
      name: "WebGLWaterSurface",
      uniforms: {
        color: { value: null },
        tDiffuse: { value: null },
        textureMatrix: { value: null },
        tWater: { value: null },
        uTile: { value: WATER_TILE },
        uDistort: { value: 0.25 },
        uGlintDir: { value: new THREE.Vector3(0, 1, 0) },
        uGlintColor: { value: new THREE.Color(0, 0, 0) },
        uDeep: { value: new THREE.Color(0, 0, 0) },
        uHorizon: { value: new THREE.Color(0, 0, 0) },
        uFade: { value: 0 },
      },
      vertexShader: surfaceVert,
      fragmentShader: surfaceFrag,
    },
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.set(0, yPos, -150);
  return reflector;
}

const skyPalette = [
  { p: 0, zenith: "#03050c", horizon: "#0b1226", deep: "#01040a" },
  { p: 0.17, zenith: "#060b1e", horizon: "#1a2244", deep: "#02060f" },
  { p: 0.215, zenith: "#14204a", horizon: "#5a3f66", deep: "#060d1e" },
  { p: 0.25, zenith: "#34518c", horizon: "#ff9a5a", deep: "#0b1a2e" },
  { p: 0.31, zenith: "#4f84c4", horizon: "#f3cba4", deep: "#12324d" },
  { p: 0.4, zenith: "#3f7fd0", horizon: "#c9e0f2", deep: "#154160" },
  { p: 0.5, zenith: "#3a7bd5", horizon: "#d2e6f5", deep: "#164666" },
  { p: 0.62, zenith: "#4278c4", horizon: "#e8dcc0", deep: "#153f5c" },
  { p: 0.71, zenith: "#3b5d9a", horizon: "#ffb066", deep: "#12304a" },
  { p: 0.75, zenith: "#283a6b", horizon: "#ff6f3c", deep: "#0d1f36" },
  { p: 0.79, zenith: "#121a3d", horizon: "#6b3a5e", deep: "#070f20" },
  { p: 0.86, zenith: "#04070f", horizon: "#0e1530", deep: "#02060d" },
  { p: 1, zenith: "#03050c", horizon: "#0b1226", deep: "#01040a" },
].map((s) => ({
  p: s.p,
  zenith: new THREE.Color(s.zenith),
  horizon: new THREE.Color(s.horizon),
  deep: new THREE.Color(s.deep),
}));

const maxElev = THREE.MathUtils.degToRad(14);
const maxAzim = THREE.MathUtils.degToRad(90);
const sunLow = new THREE.Color("#ffae6b");
const sunHigh = new THREE.Color("#fff2dc");
const moonTint = new THREE.Color("#c9d6ff");
const moonAngRad = THREE.MathUtils.degToRad(0.95);
const nightCardTint = new THREE.Color(0.72, 0.78, 0.95);
const duskCardTint = new THREE.Color(1, 0.88, 0.78);

const skyVert = `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const skyFrag = `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uMoonDir;
  uniform vec3 uMoonColor;
  uniform float uMoonVis;
  uniform float uMoonRadius;
  uniform sampler2D uMoonMap;
  uniform float uNight;
  uniform float uTime;
  uniform float uFade;
  varying vec3 vWorld;

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  void main() {
    vec3 dir = normalize(vWorld - cameraPosition);
    float h = max(dir.y, 0.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.45));

    float sd = max(dot(dir, uSunDir), 0.0);
    col += uSunColor * (pow(sd, 6.0) * 0.18 + pow(sd, 60.0) * 0.45);
    col += uSunColor * smoothstep(0.99986, 0.99993, sd) * 6.0;

    vec3 m = uMoonDir;
    vec3 right = normalize(cross(m, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, m);
    vec2 q = vec2(dot(dir, right), dot(dir, up)) / uMoonRadius;
    float rq = length(q);
    float facing = step(0.0, dot(dir, m));
    float moonMask = (1.0 - smoothstep(1.0 - max(fwidth(rq) * 1.5, 0.05), 1.0, rq)) * facing;
    vec3 n = vec3(q, sqrt(max(0.0, 1.0 - rq * rq)));
    vec2 moonUv = vec2(0.5 + atan(n.x, n.z) / 6.2831853, 0.5 + asin(clamp(n.y, -1.0, 1.0)) / 3.1415927);
    vec3 albedo = texture2D(uMoonMap, moonUv).rgb;
    vec3 L = normalize(vec3(0.33, 0.1, 0.94));
    float mu0 = max(dot(n, L), 0.0);
    float lit = 2.0 * mu0 / (mu0 + n.z + 1e-3);
    vec3 moon = (1.0 - exp(-albedo * lit * 6.0)) * vec3(1.0, 0.97, 0.9) + albedo * 0.015;
    float ang = acos(clamp(dot(dir, m), -1.0, 1.0));
    float edge = max(ang - uMoonRadius, 0.0);
    float glow = exp(-edge * 70.0) * 0.45 + exp(-edge * 14.0) * 0.16 + exp(-ang * 3.0) * 0.07;
    col += uMoonColor * glow * facing;
    col = mix(col, moon, moonMask * uMoonVis);

    vec3 sp = dir * 260.0;
    vec3 id = floor(sp);
    float r = hash13(id);
    vec3 jitter = vec3(hash13(id + 7.1), hash13(id + 3.7), hash13(id + 1.3)) - 0.5;
    float star = step(0.985, r) * smoothstep(0.22, 0.0, length(fract(sp) - 0.5 - jitter * 0.5));
    star *= 0.55 + 0.45 * sin(uTime * (1.5 + r * 3.0) + r * 60.0);
    col += star * uNight * smoothstep(0.0, 0.12, dir.y) * 1.4 * (1.0 - min(moonMask + glow * 3.0, 1.0) * uMoonVis);

    gl_FragColor = vec4(col * uFade, 1.0);
    #include <colorspace_fragment>
  }
`;

const smooth01 = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

function orbitDir(phase: number, out: THREE.Vector3) {
  phase = ((phase % 1) + 1) % 1;
  const elev = Math.sin(2 * Math.PI * (phase - 0.25)) * maxElev;
  const azim = (0.5 - phase) * 2 * maxAzim;
  return out.set(
    Math.sin(azim) * Math.cos(elev),
    Math.sin(elev),
    -Math.cos(azim) * Math.cos(elev)
  );
}

class SkyDome {
  uniforms: any;
  mesh: THREE.Mesh;
  deep = new THREE.Color();
  tint = new THREE.Color(1, 1, 1);
  glintDir = new THREE.Vector3();
  glintColor = new THREE.Color();
  particleColor = new THREE.Color();
  uiTone = 0;
  labelTone = 0;
  private _c = new THREE.Color();

  constructor(fadeUniform: { value: number }) {
    this.uniforms = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() },
      uSunColor: { value: new THREE.Color() },
      uMoonDir: { value: new THREE.Vector3() },
      uMoonColor: { value: new THREE.Color() },
      uMoonVis: { value: 0 },
      uMoonRadius: { value: Math.sin(moonAngRad) },
      uMoonMap: { value: null },
      uNight: { value: 0 },
      uTime: { value: 0 },
      uFade: fadeUniform,
    };

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(150, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: THREE.BackSide,
        depthWrite: false,
      })
    );
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;

    const moonTex = new THREE.TextureLoader().load(mediaPath("moon.jpg"));
    moonTex.colorSpace = THREE.SRGBColorSpace;
    moonTex.wrapS = THREE.RepeatWrapping;
    moonTex.anisotropy = 4;
    this.uniforms.uMoonMap.value = moonTex;
  }

  setPhase(phase: number, time: number) {
    const p = ((phase % 1) + 1) % 1;
    let idx = 0;
    while (idx < skyPalette.length - 2 && p > skyPalette[idx + 1].p) idx++;
    const a = skyPalette[idx];
    const b = skyPalette[idx + 1];
    const f = smooth01(clamp01((p - a.p) / (b.p - a.p)));
    const u = this.uniforms;

    u.uZenith.value.copy(a.zenith).lerp(b.zenith, f);
    u.uHorizon.value.copy(a.horizon).lerp(b.horizon, f);
    this.deep.copy(a.deep).lerp(b.deep, f);
    u.uTime.value = time;

    const cyc = Math.sin(2 * Math.PI * (p - 0.25));
    orbitDir(p, u.uSunDir.value);
    orbitDir(p + 0.5, u.uMoonDir.value);

    const sunVis = clamp01((cyc + 0.04) / 0.12);
    u.uSunColor.value
      .copy(sunLow)
      .lerp(sunHigh, clamp01(cyc / 0.45))
      .multiplyScalar(sunVis);

    const night = clamp01((0.1 - cyc) / 0.45);
    u.uNight.value = night;

    const moonVis = clamp01((-cyc - 0.02) / 0.1);
    u.uMoonVis.value = moonVis;
    u.uMoonColor.value.copy(moonTint).multiplyScalar(moonVis);

    if (cyc > -0.02) {
      this.glintDir.copy(u.uSunDir.value);
      this.glintColor.copy(u.uSunColor.value);
    } else {
      this.glintDir.copy(u.uMoonDir.value);
      this.glintColor.copy(u.uMoonColor.value).multiplyScalar(0.6);
    }

    const dusk = clamp01(1 - Math.abs(cyc) / 0.3) * (1 - night);
    this.tint
      .setRGB(1, 1, 1)
      .lerp(nightCardTint, night * 0.8)
      .multiply(this._c.setRGB(1, 1, 1).lerp(duskCardTint, dusk * 0.7));

    this.particleColor
      .setRGB(1, 0.95, 0.86)
      .multiplyScalar(0.5)
      .lerp(this._c.setRGB(1, 0.7, 0.4).multiplyScalar(1), dusk)
      .lerp(this._c.setRGB(0.62, 0.76, 1).multiplyScalar(0.9), night);

    const luma = (c: THREE.Color) =>
      0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const sample = this._c
      .copy(u.uHorizon.value)
      .lerp(u.uZenith.value, Math.pow(Math.sin(0.26), 0.45));
    const stepTone = (v: number) => clamp01((v - 0.16) / 0.04);
    this.uiTone = stepTone(luma(sample));
    this.labelTone = stepTone(
      luma(sample.copy(u.uHorizon.value).lerp(this.deep, 0.25))
    );
  }
}

const motesVert = `
  attribute vec4 seed;
  uniform float uTime;
  uniform float uOffset;
  uniform float uSize;
  uniform float uScale;
  uniform vec3 uMin;
  uniform vec3 uExtent;
  varying float vAlpha;

  void main() {
    vec3 p = uMin + position * uExtent;
    p.x += uTime * (0.015 + seed.x * 0.035) + uOffset * (0.3 + 0.7 * position.z);
    float ex = fract((p.x - uMin.x) / uExtent.x);
    p.x = uMin.x + ex * uExtent.x;
    p.y += sin(uTime * (0.25 + seed.y * 0.35) + seed.z * 6.2831) * 0.05;
    p.z += cos(uTime * (0.2 + seed.w * 0.3) + seed.x * 6.2831) * 0.04;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.4 + seed.w) * uScale / -mv.z;

    float twinkle = pow(0.5 + 0.5 * sin(uTime * (0.6 + seed.y * 1.8) + seed.x * 40.0), 3.0);
    vAlpha = (0.35 + 0.65 * twinkle) * smoothstep(0.0, 0.08, ex) * smoothstep(1.0, 0.92, ex);
  }
`;

const motesFrag = `
  uniform vec3 uColor;
  uniform float uFade;
  varying float vAlpha;

  void main() {
    float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(uColor * a * a * vAlpha * uFade, 1.0);
    #include <colorspace_fragment>
  }
`;

class AtmosphericMotes {
  uniforms: any;
  points: THREE.Points;

  constructor({
    count,
    min,
    max,
    fade,
  }: {
    count: number;
    min: THREE.Vector3;
    max: THREE.Vector3;
    fade: { value: number };
  }) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      pos.set([Math.random(), Math.random(), Math.random()], i * 3);
      seed.set(
        [Math.random(), Math.random(), Math.random(), Math.random()],
        i * 4
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("seed", new THREE.BufferAttribute(seed, 4));

    this.uniforms = {
      uTime: { value: 0 },
      uOffset: { value: 0 },
      uSize: { value: 0.026 },
      uScale: { value: 500 },
      uMin: { value: min.clone() },
      uExtent: { value: max.clone().sub(min) },
      uColor: { value: new THREE.Color() },
      uFade: fade,
    };

    this.points = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: motesVert,
        fragmentShader: motesFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.points.frustumCulled = false;
  }

  resize(heightPx: number, fovDeg: number) {
    this.uniforms.uScale.value =
      heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg / 2)));
  }

  update(time: number, scrollOffset: number, color: THREE.Color) {
    this.uniforms.uTime.value = time;
    this.uniforms.uOffset.value = -scrollOffset * 0.35;
    this.uniforms.uColor.value.copy(color);
  }
}

const CARD_W = 1.6;
const CARD_H = 1.0;
const CARD_GAP = 0.045;
const STEP_X = CARD_W + CARD_GAP;
const CARD_RADIUS = 0.05;
const LABEL_GAP = 0.05;
const LABEL_H = 0.11;
const FOV = 36;
const WATER_Y = -CARD_H / 2 - 0.12;
const INITIAL_SKY_PHASE = 0.88; // Start under the dramatic starry night + full moon sky!

const ribbonConfig = {
  lift: 0.18,
  baseAmp: 0.78,
  baseFreq: 0.5,
  basePhase: 0,
  drift: 0.05,
  concave: 0.15,
  twist: 0.88,
  twistFreq: 0.53,
  twistSpeed: 1.1,
  waveZ: 0,
  waveZFreq: 0.85,
  waveY: 0.28,
  waveYFreq: 1.35,
  energy: 0.17,
  energyMax: 1.1,
  energyRise: 5,
  energySettle: 2.2,
};

const ribbonDeformGLSL = `
  uniform float uOffset;
  uniform float uTime;
  uniform float uAmp;
  uniform float uDir;
  uniform vec4 uBase;
  uniform vec4 uDyn;
  uniform vec3 uDyn2;
  uniform float uLift;

  vec3 ribbon(vec2 local) {
    float u = uOffset + local.x;
    float side = 0.3 + smoothstep(0.2, 2.4, abs(u));
    float tw = uAmp * uDir * uDyn.x * side * sin(u * uDyn.y - uTime * uDyn.z + 0.6);
    vec3 p;
    p.x = u;
    p.y = local.y * cos(tw);
    p.z = local.y * sin(tw);
    p.z += uBase.x * sin(u * uBase.y + uBase.z) - uBase.w * u * u;
    p.z += uAmp * uDyn.w * sin(u * uDyn2.x + uTime * 0.8);
    p.y += uAmp * uDyn2.y * (0.5 + 0.5 * sin(u * uDyn2.z - uTime * 1.3));
    p.y += uLift;
    return p;
  }
`;

const cardVert = `
  ${ribbonDeformGLSL}
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;

  void main() {
    vUv = uv;
    vec2 local = position.xy;
    const float e = 0.004;
    vec3 p = ribbon(local);
    vec3 px = ribbon(local + vec2(e, 0.0));
    vec3 py = ribbon(local + vec2(0.0, e));
    vNormal = normalize(normalMatrix * cross(px - p, py - p));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const cardFrag = `
  uniform sampler2D uMap;
  uniform vec2 uSize;
  uniform float uRadius;
  uniform float uFade;
  uniform float uAmp;
  uniform vec3 uTint;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;

  float sdRoundBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    vec2 p = (vUv - 0.5) * uSize;
    float d = sdRoundBox(p, uSize * 0.5, uRadius);
    float aa = fwidth(d) * 1.5;
    float alpha = 1.0 - smoothstep(-aa, 0.0, d);
    if (alpha < 0.002) discard;

    vec3 col = texture2D(uMap, vUv).rgb;

    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(vView);
    float facing = clamp(dot(N, V), 0.0, 1.0);
    col *= mix(0.3, 1.0, smoothstep(0.1, 0.85, facing));
    vec3 L = normalize(vec3(-0.35, 0.55, 0.8));
    float spec = pow(clamp(dot(N, normalize(L + V)), 0.0, 1.0), 48.0);
    col += spec * 0.15 * uAmp;
    if (!gl_FrontFacing) col *= 0.3;
    col *= uTint;

    gl_FragColor = vec4(col * uFade, alpha);
    #include <colorspace_fragment>
  }
`;

const labelVert = `
  ${ribbonDeformGLSL}
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(ribbon(position.xy), 1.0);
  }
`;

const labelFrag = `
  uniform sampler2D uLabel;
  uniform vec3 uLabelColor;
  uniform float uFade;
  varying vec2 vUv;
  void main() {
    float a = texture2D(uLabel, vUv).a * uFade;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uLabelColor, a);
    #include <colorspace_fragment>
  }
`;

const damp = (cur: number, target: number, lambda: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-lambda * dt));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const GRID_X = 12;
const GRID_Y = 8;

function smoothstepRange(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function rayTri2D(
  pt: THREE.Vector2,
  buf: Float32Array,
  i0: number,
  i1: number,
  i2: number
) {
  const x0 = buf[i0 * 3],
    y0 = buf[i0 * 3 + 1];
  const x1 = buf[i1 * 3],
    y1 = buf[i1 * 3 + 1];
  const x2 = buf[i2 * 3],
    y2 = buf[i2 * 3 + 1];
  const det = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (Math.abs(det) < 1e-9) return Infinity;
  const u = ((y1 - y2) * (pt.x - x2) + (x2 - x1) * (pt.y - y2)) / det;
  const v = ((y2 - y0) * (pt.x - x2) + (x0 - x2) * (pt.y - y2)) / det;
  const w = 1 - u - v;
  if (u < 0 || v < 0 || w < 0) return Infinity;
  return u * buf[i0 * 3 + 2] + v * buf[i1 * 3 + 2] + w * buf[i2 * 3 + 2];
}

function makeLabelTexture(text: string, aniso: number) {
  const h = Math.round((2048 * LABEL_H) / CARD_W);
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const fontSize = Math.round(h * 0.62);
  const baseline = Math.round(h * 0.74);
  ctx.font = `400 ${fontSize}px "Inter Tight", "Helvetica Neue", Arial, sans-serif`;
  if ("letterSpacing" in ctx) (ctx as any).letterSpacing = "-2px";
  ctx.fillStyle = "#fff";
  ctx.fillText(text, 4, baseline);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = aniso;
  return tex;
}

class FeaturedCarouselScene {
  media: MediaPool;
  projects: ProjectItem[];
  onOpen: (idx: number) => void;
  isBlocked: () => boolean;
  count: number;
  loop: number;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
  shape = ribbonConfig;
  shared: any;
  cards: Array<{
    index: number;
    mesh: THREE.Mesh;
    labelMesh: THREE.Mesh;
    material: THREE.ShaderMaterial;
    offset: number;
    visible: boolean;
  }>;
  sky: SkyDome;
  water: WaterSimulation;
  surface: PlanarReflector;
  nextDrop = 0;
  particles: AtmosphericMotes;
  scroll = { current: 0, target: 0, last: 0 };
  vel = 0;
  amp = 0;
  dir = 0;
  lastInput = -Infinity;
  time = 0;
  fade = 0;
  pointer = { ndc: new THREE.Vector2(), inside: false };
  drag: any = null;
  hovered: any = null;
  uiTone = 0;
  unitsPerPx = 0.003;
  visibleHalf = 2;
  aspect = 1;
  distance = 4;
  width = 1;
  height = 1;
  private _v = new THREE.Vector3();
  private _grid = new Float32Array((GRID_X + 1) * (GRID_Y + 1) * 3);

  constructor({
    renderer,
    media,
    projects,
    onOpen,
    isBlocked,
  }: {
    renderer: THREE.WebGLRenderer;
    media: MediaPool;
    projects: ProjectItem[];
    onOpen: (idx: number) => void;
    isBlocked: () => boolean;
  }) {
    this.media = media;
    this.projects = projects;
    this.onOpen = onOpen;
    this.isBlocked = isBlocked;
    this.count = projects.length;
    this.loop = this.count * STEP_X;

    this.shared = {
      uTime: { value: 0 },
      uAmp: { value: 0 },
      uDir: { value: 0 },
      uFade: { value: 0 },
      uBase: { value: new THREE.Vector4() },
      uDyn: { value: new THREE.Vector4() },
      uDyn2: { value: new THREE.Vector3() },
      uSize: { value: new THREE.Vector2(CARD_W, CARD_H) },
      uRadius: { value: CARD_RADIUS },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uLift: { value: ribbonConfig.lift },
      uLabelColor: { value: new THREE.Color(0.95, 0.95, 0.95) },
    };

    const cardGeo = new THREE.PlaneGeometry(CARD_W, CARD_H, 64, 40);
    const labelGeo = new THREE.PlaneGeometry(CARD_W, LABEL_H, 64, 1);
    labelGeo.translate(0, -0.605, 0);

    const aniso = renderer.capabilities.getMaxAnisotropy();
    this.cards = projects.map((proj, idx) => {
      const uOffset = { value: 0 };
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          ...this.shared,
          uMap: { value: media.get(idx).poster },
          uOffset,
        },
        vertexShader: cardVert,
        fragmentShader: cardFrag,
        transparent: true,
        side: THREE.DoubleSide,
        forceSinglePass: true,
      });
      const mesh = new THREE.Mesh(cardGeo, mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);

      const labelMesh = new THREE.Mesh(
        labelGeo,
        new THREE.ShaderMaterial({
          uniforms: {
            ...this.shared,
            uLabel: { value: makeLabelTexture(`${proj.title} — ${proj.category}`, aniso) },
            uOffset,
          },
          vertexShader: labelVert,
          fragmentShader: labelFrag,
          transparent: true,
          depthWrite: false,
        })
      );
      labelMesh.frustumCulled = false;
      this.scene.add(labelMesh);

      return {
        index: idx,
        mesh,
        labelMesh,
        material: mat,
        offset: 0,
        visible: false,
      };
    });

    this.sky = new SkyDome(this.shared.uFade);
    this.scene.add(this.sky.mesh);

    this.water = new WaterSimulation(renderer);
    this.surface = createWaterSurface(WATER_Y);
    this.scene.add(this.surface);

    for (let i = 0; i < 20; i++) {
      this.water.addDrop(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 6,
        0.03,
        i & 1 ? 0.004 : -0.004
      );
    }

    this.particles = new AtmosphericMotes({
      count: 260,
      min: new THREE.Vector3(-6, WATER_Y + 0.08, -3.5),
      max: new THREE.Vector3(6, 1.6, 2.3),
      fade: this.shared.uFade,
    });
    this.scene.add(this.particles.points);

    this.applyShape();
    this.bindEvents(renderer.domElement);
  }

  intro() {
    this.scroll.current = this.scroll.last = -STEP_X * 3;
    this.scroll.target = 0;
    this.lastInput = this.time;
    this.fade = 0;
  }

  resize(w: number, h: number, dpr = 1) {
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.aspect = aspect;
    const frac = aspect < 1 ? 0.82 : clamp(0.48 - (aspect - 1.3) * 0.08, 0.36, 0.48);
    const visW = CARD_W / frac;
    const visH = visW / aspect;
    this.distance = visH / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    this.visibleHalf = visW / 2;
    this.unitsPerPx = visW / w;
    this.camera.updateProjectionMatrix();
    this.width = w;
    this.height = h;
    this.applyShape();
    this.particles.resize(h * dpr, FOV);
    this.surface
      .getRenderTarget()
      .setSize(Math.round(w * dpr * 0.5), Math.round(h * dpr * 0.5));
  }

  applyShape() {
    const s = this.shape;
    const amp = this.aspect < 1 ? s.baseAmp / 3 : s.baseAmp;
    this.shared.uBase.value.set(amp, s.baseFreq, s.basePhase, s.concave);
    this.shared.uDyn.value.set(s.twist, s.twistFreq, s.twistSpeed, s.waveZ);
    this.shared.uDyn2.value.set(s.waveZFreq, s.waveY, s.waveYFreq);
    this.shared.uLift.value = s.lift;
  }

  bindEvents(canvas: HTMLElement) {
    const blocked = () => this.isBlocked();

    window.addEventListener(
      "wheel",
      (e) => {
        if (blocked()) return;
        e.preventDefault();
        const mult = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.width : 1;
        const delta =
          Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        this.scroll.target += delta * mult * 0.0026;
        this.lastInput = this.time;
      },
      { passive: false }
    );

    canvas.addEventListener("pointerdown", (e) => {
      if (blocked() || e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      this.setPointer(e);
      const hit = this.hitTest(this.pointer.ndc);
      this.drag = {
        id: e.pointerId,
        x: e.clientX,
        moved: 0,
        vx: 0,
        t: performance.now(),
        card: hit,
      };
    });

    canvas.addEventListener("pointermove", (e) => {
      this.setPointer(e);
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x;
      const now = performance.now();
      const dt = Math.max((now - d.t) / 1000, 1 / 240);
      d.vx = damp(d.vx, dx / dt, 18, dt);
      d.x = e.clientX;
      d.t = now;
      d.moved += Math.abs(dx);
      if (d.moved > 6) document.body.dataset.dragging = "";
      this.scroll.target -= dx * this.unitsPerPx * 1.1;
      this.lastInput = this.time;
    });

    const onUp = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      delete document.body.dataset.dragging;
      if (e.pointerType !== "mouse") this.pointer.inside = false;
      if (d.moved < 6) {
        if (d.card) this.onOpen(d.card.index);
      } else if (performance.now() - d.t < 80) {
        this.scroll.target -= d.vx * this.unitsPerPx * 0.22;
      }
      this.lastInput = this.time;
    };

    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", () => {
      this.pointer.inside = false;
    });

    window.addEventListener("keydown", (e) => {
      if (blocked()) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const dir = e.key === "ArrowRight" ? 1 : -1;
        this.scroll.target =
          (Math.round(this.scroll.target / STEP_X) + dir) * STEP_X;
        this.lastInput = this.time;
      } else if (e.key === "Enter" && document.activeElement === document.body) {
        this.onOpen(this.centerIndex());
      }
    });
  }

  setPointer(e: PointerEvent) {
    this.pointer.ndc.set(
      (e.clientX / this.width) * 2 - 1,
      -(e.clientY / this.height) * 2 + 1
    );
    this.pointer.inside = true;
  }

  centerIndex() {
    return (
      ((Math.round(this.scroll.current / STEP_X) % this.count) + this.count) %
      this.count
    );
  }

  update(dt: number, elapsed: number, interactive: boolean) {
    this.time = elapsed;
    const sc = this.scroll;
    const sh = this.shape;
    sc.current = damp(sc.current, sc.target, this.drag ? 14 : 6, dt);
    const v = (sc.current - sc.last) / Math.max(dt, 1e-4);
    sc.last = sc.current;
    this.vel = damp(this.vel, v, 10, dt);

    const targetAmp = Math.min(Math.abs(this.vel) * sh.energy, sh.energyMax) + 0.03;
    this.amp = damp(
      this.amp,
      targetAmp,
      targetAmp > this.amp ? sh.energyRise : sh.energySettle,
      dt
    );
    this.dir = damp(this.dir, clamp(this.vel * 2.5, -1, 1), 3, dt);
    this.fade = damp(this.fade, 1, 1.6, dt);

    const u = this.shared;
    u.uTime.value = elapsed;
    u.uAmp.value = this.amp;
    u.uDir.value = this.dir;
    u.uFade.value = this.fade;
    u.uBase.value.z = sh.basePhase + Math.sin(elapsed * sh.drift) * 0.5;

    this.camera.position.set(0, 0.03, this.distance);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();

    this.updateEnvironment(dt, elapsed);

    const maxVis = this.visibleHalf + STEP_X * 1.25;
    for (const card of this.cards) {
      const raw = card.index * STEP_X - sc.current + this.loop / 2;
      card.offset = ((raw % this.loop) + this.loop) % this.loop - this.loop / 2;
      card.visible = Math.abs(card.offset) < maxVis;
      card.mesh.visible = card.visible;
      card.labelMesh.visible = card.visible;
      card.material.uniforms.uOffset.value = card.offset;
      if (card.visible) {
        this.media.prefetch(card.index);
        card.material.uniforms.uMap.value = this.media.get(card.index).texture;
      }
    }

    this.hovered =
      interactive && this.pointer.inside && !this.drag
        ? this.hitTest(this.pointer.ndc)
        : null;
    if (interactive) {
      if (this.hovered) {
        document.body.dataset.hover = "card";
      } else if (document.body.dataset.hover === "card") {
        delete document.body.dataset.hover;
      }
    }
    if (this.hovered) {
      this.media.want(this.hovered.index);
    }
  }

  updateEnvironment(dt: number, elapsed: number) {
    const sky = this.sky;
    sky.setPhase(INITIAL_SKY_PHASE + this.scroll.current / this.loop, elapsed);
    this.shared.uTint.value.copy(sky.tint);

    const labelCol = this.shared.uLabelColor.value;
    const targetL = sky.labelTone > 0.5 ? 0.06 : 0.95;
    const k = 1 - Math.exp(-4 * dt);
    labelCol.setRGB(
      labelCol.r + (targetL - labelCol.r) * k,
      labelCol.g + (targetL - labelCol.g) * k,
      labelCol.b + (targetL - labelCol.b) * k
    );

    this.particles.update(elapsed, this.scroll.current, sky.particleColor);
    this.uiTone = sky.uiTone;

    const surfU = (this.surface.material as THREE.ShaderMaterial).uniforms;
    surfU.tWater.value = this.water.texture;
    surfU.uGlintDir.value.copy(sky.glintDir);
    surfU.uGlintColor.value.copy(sky.glintColor);
    surfU.uDeep.value.copy(sky.deep);
    surfU.uHorizon.value.copy(sky.uniforms.uHorizon.value);
    surfU.uFade.value = this.fade;

    if (elapsed > this.nextDrop) {
      this.nextDrop = elapsed + 0.5 + Math.random() * 1;
      const rx = (Math.random() - 0.5) * this.visibleHalf * 2.4;
      const rz = -0.7 + Math.random() * 2.2;
      this.water.addDrop(
        rx,
        rz,
        0.02 + Math.random() * 0.01,
        (Math.random() < 0.5 ? 1 : -1) * 0.004
      );
    }

    if (this.amp > 0.35) {
      const base = this.shared.uBase.value;
      for (const card of this.cards) {
        if (
          !card.visible ||
          Math.abs(card.offset) > this.visibleHalf + CARD_W * 0.5 ||
          Math.random() > this.amp * 0.2
        )
          continue;
        const ux = card.offset + (Math.random() - 0.5) * CARD_W;
        const uz = base.x * Math.sin(ux * base.y + base.z) - base.w * ux * ux;
        this.water.addDrop(ux, uz + 0.05, 0.02, -0.004 * Math.min(this.amp, 1));
      }
    }
    this.water.update(dt);
  }

  ribbonPoint(
    lx: number,
    ly: number,
    offset: number,
    out: THREE.Vector3
  ): THREE.Vector3 {
    const amp = this.shared.uAmp.value;
    const dir = this.shared.uDir.value;
    const time = this.shared.uTime.value;
    const base = this.shared.uBase.value;
    const sh = this.shape;
    const u = offset + lx;
    const side = 0.3 + smoothstepRange(0.2, 2.4, Math.abs(u));
    const tw =
      amp * dir * sh.twist * side * Math.sin(u * sh.twistFreq - time * sh.twistSpeed + 0.6);
    let py = ly * Math.cos(tw);
    let pz = ly * Math.sin(tw);
    pz += base.x * Math.sin(u * base.y + base.z) - base.w * u * u;
    pz += amp * sh.waveZ * Math.sin(u * sh.waveZFreq + time * 0.8);
    py += amp * sh.waveY * (0.5 + 0.5 * Math.sin(u * sh.waveYFreq - time * 1.3));
    py += sh.lift;
    return out.set(u, py, pz);
  }

  hitTest(ndc: THREE.Vector2) {
    let bestCard: any = null;
    let bestZ = Infinity;
    const grid = this._grid;
    const v = this._v;
    const stride = GRID_X + 1;

    for (const card of this.cards) {
      if (!card.visible) continue;
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (let iy = 0; iy <= GRID_Y; iy++) {
        for (let ix = 0; ix <= GRID_X; ix++) {
          const ly = CARD_H / 2 - (iy / GRID_Y) * (CARD_H + LABEL_GAP + LABEL_H);
          this.ribbonPoint((ix / GRID_X - 0.5) * CARD_W, ly, card.offset, v).project(
            this.camera
          );
          const k = (iy * stride + ix) * 3;
          grid[k] = v.x;
          grid[k + 1] = v.y;
          grid[k + 2] = v.z;
          if (v.x < minX) minX = v.x;
          if (v.x > maxX) maxX = v.x;
          if (v.y < minY) minY = v.y;
          if (v.y > maxY) maxY = v.y;
        }
      }
      if (ndc.x < minX || ndc.x > maxX || ndc.y < minY || ndc.y > maxY) continue;
      for (let iy = 0; iy < GRID_Y; iy++) {
        for (let ix = 0; ix < GRID_X; ix++) {
          const idx = iy * stride + ix;
          const z = Math.min(
            rayTri2D(ndc, grid, idx, idx + 1, idx + stride + 1),
            rayTri2D(ndc, grid, idx, idx + stride + 1, idx + stride)
          );
          if (z < bestZ) {
            bestZ = z;
            bestCard = card;
          }
        }
      }
    }
    return bestCard;
  }
}

class FullIndexScene {
  media: MediaPool;
  projects: ProjectItem[];
  onOpen: (idx: number) => void;
  isBlocked: () => boolean;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  listEl: HTMLElement;
  links: HTMLAnchorElement[];
  listCanvas = document.createElement("canvas");
  hiCanvas = document.createElement("canvas");
  listTex: THREE.CanvasTexture;
  hiTex: THREE.CanvasTexture;
  listMesh: THREE.Mesh;
  hiMesh: THREE.Mesh;
  previewUniforms: any;
  preview: THREE.Mesh;
  hovered = -1;
  shown = 0;
  reveal = 0;
  pointer = new THREE.Vector2(-9999, -9999);
  pos = new THREE.Vector2();
  vel = new THREE.Vector2();
  dirty = true;
  width = 1;
  height = 1;
  dpr = 1;
  previewSize = new THREE.Vector2(300, 180);

  constructor({
    media,
    projects,
    onOpen,
    isBlocked,
  }: {
    media: MediaPool;
    projects: ProjectItem[];
    onOpen: (idx: number) => void;
    isBlocked: () => boolean;
  }) {
    this.media = media;
    this.projects = projects;
    this.onOpen = onOpen;
    this.isBlocked = isBlocked;
    this.camera.position.z = 5;
    this.listEl = document.querySelector(".full__list")!;

    // Show the 7 unique projects in Index View
    const uniqueProjects = projects.slice(0, 7);
    this.links = uniqueProjects.map((proj, idx) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = proj.url;
      a.textContent = proj.title;
      a.dataset.index = String(idx);
      li.append(a);
      if (idx < uniqueProjects.length - 1) {
        const sep = document.createElement("span");
        sep.className = "sep";
        sep.setAttribute("aria-hidden", "true");
        sep.textContent = "·";
        li.append(sep);
      }
      this.listEl.append(li, " ");
      a.addEventListener("pointerenter", () => this.setHovered(idx));
      a.addEventListener("focus", () => this.setHovered(idx));
      a.addEventListener("pointerleave", () => this.setHovered(-1));
      a.addEventListener("blur", () => this.setHovered(-1));
      a.addEventListener("click", (e) => {
        e.preventDefault();
        if (!this.isBlocked()) this.onOpen(idx);
      });
      return a;
    });

    window.addEventListener("pointermove", (e) => {
      this.pointer.set(e.clientX, e.clientY);
    });

    const makeTex = (c: HTMLCanvasElement) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      return t;
    };

    this.listTex = makeTex(this.listCanvas);
    this.hiTex = makeTex(this.hiCanvas);
    const plane = new THREE.PlaneGeometry(1, 1);
    this.listMesh = new THREE.Mesh(
      plane,
      new THREE.MeshBasicMaterial({ map: this.listTex, transparent: true })
    );
    this.hiMesh = new THREE.Mesh(
      plane,
      new THREE.MeshBasicMaterial({ map: this.hiTex, transparent: true })
    );
    this.hiMesh.position.z = 2;

    this.previewUniforms = {
      uMap: { value: media.get(0).poster },
      uSize: { value: new THREE.Vector2(1, 1) },
      uRadius: { value: 14 },
      uReveal: { value: 0 },
      uVel: { value: new THREE.Vector2() },
    };

    this.preview = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1, 24, 24),
      new THREE.ShaderMaterial({
        uniforms: this.previewUniforms,
        vertexShader: `
          uniform vec2 uVel;
          uniform float uReveal;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec3 p = position;
            p.x -= sin(uv.y * 3.14159) * uVel.x * 0.16;
            p.y -= sin(uv.x * 3.14159) * uVel.y * 0.16;
            p.xy *= mix(0.72, 1.0, uReveal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D uMap;
          uniform vec2 uSize;
          uniform float uRadius;
          uniform float uReveal;
          varying vec2 vUv;
          float sdRoundBox(vec2 p, vec2 b, float r) {
            vec2 q = abs(p) - b + r;
            return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
          }
          void main() {
            vec2 p = (vUv - 0.5) * uSize;
            float d = sdRoundBox(p, uSize * 0.5, uRadius);
            float alpha = 1.0 - smoothstep(-1.5, 0.0, d);
            float r = length(p) / length(uSize * 0.5);
            alpha *= 1.0 - smoothstep(uReveal * 1.25 - 0.15, uReveal * 1.25, r);
            if (alpha < 0.002) discard;
            vec3 col = texture2D(uMap, vUv).rgb;
            gl_FragColor = vec4(col, alpha);
            #include <colorspace_fragment>
          }
        `,
        transparent: true,
      })
    );
    this.preview.position.z = 1;
    this.scene.add(this.listMesh, this.preview, this.hiMesh);
  }

  setHovered(idx: number) {
    if (idx === this.hovered) return;
    if (idx >= 0 && this.reveal < 0.05) this.pos.copy(this.pointer);
    this.hovered = idx;
    if (idx >= 0) this.shown = idx;
    this.drawHighlight();
  }

  resize(w: number, h: number, dpr: number) {
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    Object.assign(this.camera, {
      left: -w / 2,
      right: w / 2,
      top: h / 2,
      bottom: -h / 2,
    });
    this.camera.updateProjectionMatrix();
    this.listCanvas.width = Math.round(w * dpr);
    this.listCanvas.height = Math.round(h * dpr);
    this.listTex.dispose();
    this.listMesh.scale.set(w, h, 1);
    const pw = Math.min(Math.max(w * (w < 700 ? 0.6 : 0.24), 220), 480);
    this.previewSize.set(pw, pw / 1.6);
    this.preview.scale.set(this.previewSize.x, this.previewSize.y, 1);
    this.previewUniforms.uSize.value.copy(this.previewSize);
    this.dirty = true;
  }

  draw() {
    const ctx = this.listCanvas.getContext("2d")!;
    const nodes = this.links.flatMap((a, idx) => {
      const sep = a.nextElementSibling as HTMLElement | null;
      const next = this.links[idx + 1];
      if (!sep || !next) return [a];
      return Math.abs(
        sep.getBoundingClientRect().top - next.getBoundingClientRect().top
      ) < 2
        ? [a, sep]
        : [a];
    });
    this.paint(ctx, nodes, 0, 0, this.width, this.height);
    this.listTex.needsUpdate = true;
    this.drawHighlight();
    this.dirty = false;
  }

  drawHighlight() {
    if (!this.width) return;
    this.hiMesh.visible = this.hovered >= 0;
    if (!this.hiMesh.visible) return;
    const link = this.links[this.hovered];
    const rect = link.getBoundingClientRect();
    const pad = 4;
    const x = rect.left - pad;
    const y = rect.top - pad;
    const w = rect.width + pad * 2;
    const h = rect.height + pad * 2;
    this.hiCanvas.width = Math.ceil(w * this.dpr);
    this.hiCanvas.height = Math.ceil(h * this.dpr);
    this.paint(this.hiCanvas.getContext("2d")!, [link], x, y, w, h);
    this.hiTex.dispose();
    this.hiTex.needsUpdate = true;
    this.hiMesh.scale.set(w, h, 1);
    this.hiMesh.position.set(x + w / 2 - this.width / 2, this.height / 2 - (y + h / 2), 2);
  }

  paint(
    ctx: CanvasRenderingContext2D,
    els: HTMLElement[],
    ox: number,
    oy: number,
    w: number,
    h: number
  ) {
    const cs = getComputedStyle(this.listEl);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, -ox * this.dpr, -oy * this.dpr);
    ctx.clearRect(ox, oy, w, h);
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if ("letterSpacing" in ctx && cs.letterSpacing !== "normal") {
      (ctx as any).letterSpacing = cs.letterSpacing;
    }
    ctx.fillStyle = "#f2f2f2";
    ctx.textBaseline = "alphabetic";
    const asc = ctx.measureText("Hg").fontBoundingBoxAscent;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      ctx.fillText(el.textContent || "", r.left, r.top + asc);
    }
  }

  update(dt: number) {
    if (this.dirty) this.draw();
    const isHov = this.hovered >= 0;
    this.reveal = damp(this.reveal, isHov ? 1 : 0, isHov ? 7 : 9, dt);
    if (this.reveal > 0.01) this.media.want(this.shown);
    const px = this.pos.x;
    const py = this.pos.y;
    this.pos.x = damp(px, this.pointer.x, 10, dt);
    this.pos.y = damp(py, this.pointer.y, 10, dt);
    const invDt = 1 / Math.max(dt, 1e-4);
    this.vel.x = damp(
      this.vel.x,
      THREE.MathUtils.clamp(((this.pos.x - px) * invDt) / 2500, -1, 1),
      8,
      dt
    );
    this.vel.y = damp(
      this.vel.y,
      THREE.MathUtils.clamp((-(this.pos.y - py) * invDt) / 2500, -1, 1),
      8,
      dt
    );
    this.preview.position.x = this.pos.x - this.width / 2;
    this.preview.position.y = this.height / 2 - this.pos.y;
    this.preview.rotation.z = -this.vel.x * 0.12;
    this.preview.visible = this.reveal > 0.002;
    this.previewUniforms.uReveal.value = this.reveal;
    this.previewUniforms.uVel.value.copy(this.vel);
    this.previewUniforms.uMap.value = this.media.get(this.shown).texture;
  }
}

class LiquidTransition {
  rtFrom = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  rtTo = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  uniforms: any;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  active = false;
  duration = 1.35;
  from: any;
  to: any;
  onDone?: () => void;
  progress = 0;

  constructor() {
    this.uniforms = {
      tFrom: { value: this.rtFrom.texture },
      tTo: { value: this.rtTo.texture },
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uAspect: { value: 1 },
    };
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D tFrom;
          uniform sampler2D tTo;
          uniform float uProgress;
          uniform float uTime;
          uniform float uAspect;
          varying vec2 vUv;

          float easeInOut(float t) {
            return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) * 0.5;
          }
          vec3 split(sampler2D t, vec2 uv, vec2 off) {
            return vec3(texture2D(t, uv + off).r, texture2D(t, uv).g, texture2D(t, uv - off).b);
          }
          void main() {
            float p = easeInOut(clamp(uProgress, 0.0, 1.0));
            float pulse = sin(p * 3.14159265);
            vec2 asp = vec2(uAspect, 1.0);
            vec2 q = (vUv - 0.5) * asp;
            float len = length(q);
            vec2 dir = q / max(len, 1e-4);
            vec2 dirUv = dir / asp;
            float ang = atan(q.y, q.x);
            float wob = 0.17 * sin(ang * 3.0 + uTime * 1.6)
                      + 0.09 * sin(ang * 5.0 - uTime * 1.1 + 1.3)
                      + 0.05 * sin(ang * 2.0 + uTime * 0.7);
            float maxR = length(asp) * 0.5 * 1.5;
            float R = p * maxR * (1.0 + wob * (1.0 - 0.6 * p));
            float d = len - R;
            float ca = (0.003 + 0.014 * pulse) * exp(-abs(d) / 0.06);
            float pull = exp(-max(d, 0.0) / 0.14) * 0.1 * pulse;
            vec3 from = split(tFrom, vUv - dirUv * pull, dirUv * ca);
            float rim = 0.05 + 0.07 * pulse;
            float lens = smoothstep(-rim * 3.0, 0.0, d);
            vec3 to = split(tTo, vUv - dirUv * lens * 0.06 * pulse, dirUv * ca);
            float band = smoothstep(-rim, -rim * 0.25, d);
            float t = clamp((d + rim) / rim, 0.0, 1.0);
            vec3 glass = split(tFrom, vUv + dirUv * (1.0 - t) * 0.16 * pulse, dirUv * ca * 2.5);
            float inside = 1.0 - smoothstep(-0.002, 0.002, d);
            vec3 col = mix(from, to, inside);
            col = mix(col, glass, band * inside * 0.85 * pulse);
            col += exp(-abs(d) / 0.004) * 0.22 * pulse;
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }
        `,
        depthTest: false,
      })
    );
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  setSize(w: number, h: number, dpr: number) {
    const rw = Math.round(w * dpr);
    const rh = Math.round(h * dpr);
    this.rtFrom.setSize(rw, rh);
    this.rtTo.setSize(rw, rh);
    this.uniforms.uAspect.value = w / h;
  }

  start(from: any, to: any, onDone?: () => void) {
    this.from = from;
    this.to = to;
    this.onDone = onDone;
    this.progress = 0;
    this.active = true;
  }

  render(renderer: THREE.WebGLRenderer, dt: number, elapsed: number) {
    this.progress = Math.min(1, this.progress + dt / this.duration);
    this.uniforms.uProgress.value = this.progress;
    this.uniforms.uTime.value = elapsed;
    renderer.setRenderTarget(this.rtFrom);
    renderer.render(this.from.scene, this.from.camera);
    renderer.setRenderTarget(this.rtTo);
    renderer.render(this.to.scene, this.to.camera);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
    if (this.progress >= 1) {
      this.active = false;
      this.onDone?.();
    }
  }
}

class CaseModal {
  projects: ProjectItem[];
  el: HTMLElement;
  video: HTMLVideoElement;
  iframe: HTMLIFrameElement;
  title: HTMLElement;
  no: HTMLElement;
  category: HTMLElement;
  liveLink: HTMLAnchorElement;
  modeBtn: HTMLButtonElement;
  isOpen = false;
  liveMode = false;
  index = 0;
  returnFocus: HTMLElement | null = null;

  constructor(list: ProjectItem[]) {
    this.projects = list;
    this.el = document.querySelector(".case")!;
    this.video = this.el.querySelector(".case__video")!;
    this.iframe = this.el.querySelector(".case__iframe")!;
    this.title = this.el.querySelector(".case__title")!;
    this.no = this.el.querySelector(".case__no")!;
    this.category = this.el.querySelector(".case__category")!;
    this.liveLink = document.getElementById("case-live-url") as HTMLAnchorElement;
    this.modeBtn = document.getElementById("toggle-live-iframe") as HTMLButtonElement;

    this.el
      .querySelector(".case__close")!
      .addEventListener("click", () => this.close());
    this.el
      .querySelector(".case__prev")!
      .addEventListener("click", () => this.step(-1));
    this.el
      .querySelector(".case__next")!
      .addEventListener("click", () => this.step(1));

    this.modeBtn.addEventListener("click", () => {
      this.setLiveMode(!this.liveMode);
    });

    this.el.addEventListener("click", (e) => {
      if (e.target === this.el) this.close();
    });

    window.addEventListener("keydown", (e) => {
      if (!this.isOpen) return;
      if (e.key === "Escape") this.close();
      else if (e.key === "ArrowRight") this.step(1);
      else if (e.key === "ArrowLeft") this.step(-1);
    });
  }

  setLiveMode(enabled: boolean) {
    this.liveMode = enabled;
    const current = this.projects[this.index];
    if (enabled) {
      this.video.pause();
      this.video.hidden = true;
      this.iframe.hidden = false;
      if (this.iframe.src !== current.url) {
        this.iframe.src = current.url;
      }
      this.modeBtn.textContent = "Switch to Video Preview";
    } else {
      this.iframe.hidden = true;
      this.iframe.src = "about:blank";
      this.video.hidden = false;
      this.video.play().catch(() => {});
      this.modeBtn.textContent = "Switch to Interactive Live View";
    }
  }

  open(idx: number) {
    this.returnFocus = document.activeElement as HTMLElement;
    this.liveMode = false;
    this.show(idx);
    this.isOpen = true;
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add("is-open"));
    (this.el.querySelector(".case__close") as HTMLElement).focus({
      preventScroll: true,
    });
  }

  show(idx: number) {
    const len = this.projects.length;
    this.index = ((idx % len) + len) % len;
    const item = this.projects[this.index];
    const displayNo = (this.index % 7) + 1;
    this.title.textContent = item.title;
    this.no.textContent = `Case 0${displayNo}`;
    this.category.textContent = item.category;
    this.liveLink.href = item.url;
    this.video.poster = mediaPath(`${item.slug}.jpg`);
    this.video.src = mediaPath(`${item.slug}.mp4`);
    this.setLiveMode(this.liveMode);
  }

  step(dir: number) {
    this.show(this.index + dir);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove("is-open");
    this.video.pause();
    this.iframe.src = "about:blank";
    setTimeout(() => {
      if (!this.isOpen) {
        this.el.hidden = true;
        this.video.removeAttribute("src");
        this.video.load();
      }
    }, 500);
    this.returnFocus?.focus?.({ preventScroll: true });
  }
}

async function init() {
  const body = document.body;
  body.classList.add("is-loading");
  body.dataset.view = "featured";

  const canvas = document.querySelector(".gl") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0, 1);

  const pctEl = document.querySelector(".loader__pct")!;
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => {
    pctEl.textContent = String(Math.round((loaded / Math.max(1, total)) * 100));
  };
  const loadDone = new Promise<void>((resolve) => {
    manager.onLoad = () => resolve();
  });

  const media = new MediaPool(projects, renderer, manager);
  const modal = new CaseModal(projects);
  let activeView: "featured" | "full" = "featured";
  const transition = new LiquidTransition();
  const isBlocked = () => modal.isOpen || transition.active;

  const featuredScene = new FeaturedCarouselScene({
    renderer,
    media,
    projects,
    onOpen: (idx) => modal.open(idx),
    isBlocked: () => isBlocked() || activeView !== "featured",
  });

  const fullScene = new FullIndexScene({
    media,
    projects,
    onOpen: (idx) => modal.open(idx),
    isBlocked: () => isBlocked() || activeView !== "full",
  });

  const scenes = { featured: featuredScene, full: fullScene };
  const viewToggleBtn = document.getElementById("view-toggle")!;

  function switchView(nextView: "featured" | "full") {
    if (nextView === activeView || transition.active) return;
    const prev = scenes[activeView];
    activeView = nextView;
    body.dataset.view = nextView;
    viewToggleBtn.textContent =
      nextView === "full" ? "3D Ribbon View" : "Index View";
    document
      .querySelector(".full")!
      .setAttribute("aria-hidden", String(nextView !== "full"));
    delete body.dataset.hover;
    if (nextView !== "full") fullScene.setHovered(-1);
    transition.start(prev, scenes[nextView]);
  }

  viewToggleBtn.addEventListener("click", () => {
    switchView(activeView === "featured" ? "full" : "featured");
  });

  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    featuredScene.resize(w, h, dpr);
    fullScene.resize(w, h, dpr);
    transition.setSize(w, h, dpr);
  }

  window.addEventListener("resize", onResize);
  onResize();

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;
    if (activeView === "featured" || transition.active) {
      featuredScene.update(dt, elapsed, activeView === "featured" && !isBlocked());
    }
    if (activeView === "full" || transition.active) {
      fullScene.update(dt);
    }
    media.enabled = !modal.isOpen;
    media.update();

    if (transition.active) {
      transition.render(renderer, dt, elapsed);
    } else {
      const s = scenes[activeView];
      renderer.render(s.scene, s.camera);
    }
  });

  await Promise.race([
    loadDone,
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
  body.classList.remove("is-loading");
  featuredScene.intro();
}

init();
