/* ══════════════════════════════════════════════════════════════
   ATLAS v2 — النسخة الكاملة المطابقة لتطبيق Visible Body Atlas
   الميزات المستخرجة من libil2cpp/global-metadata:
     AnatomySearchScreen · AssetViewScreen · BubbleNavigationPanel
     ActivateTourStep · BeginStartQuiz · DetailedQuizResults
     CourseChapter · ClearAllDrawingsInCurrentView · Favorites
   ══════════════════════════════════════════════════════════════ */
import * as THREE from "./vendor/three.module.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { DRACOLoader } from "./vendor/DRACOLoader.js";

const MODEL_BASE = "./models/";
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ── الحالة ── */
const S = {
  scene: null, camera: null, renderer: null, controls: null,
  groups: [], names: {}, loaded: {}, visible: {},
  selected: null, isolated: null,
  favorites: new Set(JSON.parse(localStorage.getItem("fav") || "[]")),
  progress: JSON.parse(localStorage.getItem("prog") || "{}"),
  view: { theta: 0, phi: 0, dist: 0 },
  ready: false, totalMeshes: 0
};
window.__S = S;

/* ══════════ ① التهيئة ══════════ */
function initScene() {
  const c = $("#cv");
  S.scene = new THREE.Scene();
  S.scene.background = new THREE.Color(0x0a0e14);

  S.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 5000);
  S.camera.position.set(0, 0, 3);

  S.renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, powerPreference: "high-performance" });
  S.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  S.renderer.setSize(innerWidth, innerHeight);
  S.renderer.outputColorSpace = THREE.SRGBColorSpace;
  S.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  S.renderer.toneMappingExposure = 1.1;
  window.__T = THREE;

  // إضاءة ثلاثية (كما في التطبيق: key + fill + rim)
  S.scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3340, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(3, 5, 4); S.scene.add(key);
  const fill = new THREE.DirectionalLight(0xaaccff, 0.9); fill.position.set(-4, -2, -3); S.scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffd9b3, 0.7); rim.position.set(0, -4, 2); S.scene.add(rim);

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath("./vendor/draco/");
  loader.setDRACOLoader(draco);

  S.camera.position.set(0, 0, 400);
  addControls();
  render();
  addEventListener("resize", () => {
    S.camera.aspect = innerWidth / innerHeight;
    S.camera.updateProjectionMatrix();
    S.renderer.setSize(innerWidth, innerHeight);
  });
  return loader;
}

/* دوران باللمس — مستقل عن OrbitControls */
function addControls() {
  const c = $("#cv");
  let down = false, px = 0, py = 0, pinch = 0;
  const t = new THREE.Vector3();
  let sph = { r: 400, th: 0, ph: Math.PI / 2 };

  function apply() {
    sph.ph = Math.max(0.05, Math.min(Math.PI - 0.05, sph.ph));
    sph.r = Math.max(20, Math.min(2000, sph.r));
    S.camera.position.set(
      t.x + sph.r * Math.sin(sph.ph) * Math.sin(sph.th),
      t.y + sph.r * Math.cos(sph.ph),
      t.z + sph.r * Math.sin(sph.ph) * Math.cos(sph.th)
    );
    S.camera.lookAt(t);
    S.view = { theta: sph.th, phi: sph.ph, dist: sph.r };
  }
  S.target = t; S.sph = sph; S.applyCam = apply;

  c.addEventListener("pointerdown", e => { down = true; px = e.clientX; py = e.clientY; });
  addEventListener("pointerup", () => down = false);
  addEventListener("pointermove", e => {
    if (!down) return;
    sph.th -= (e.clientX - px) * 0.008;
    sph.ph -= (e.clientY - py) * 0.008;
    px = e.clientX; py = e.clientY;
    apply();
  });
  c.addEventListener("wheel", e => { e.preventDefault(); sph.r *= 1 + Math.sign(e.deltaY) * 0.1; apply(); }, { passive: false });
  c.addEventListener("touchstart", e => {
    if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  }, { passive: true });
  c.addEventListener("touchmove", e => {
    if (e.touches.length === 2 && pinch) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      sph.r *= pinch / d; pinch = d; apply();
    }
  }, { passive: true });
  apply();
}

function render() {
  requestAnimationFrame(render);
  S.renderer.render(S.scene, S.camera);
}

/* ══════════ ② تحميل تدريجي ══════════ */
async function loadGroup(loader, g) {
  const url = MODEL_BASE + g.file.split("/").pop();
  const gltf = await loader.loadAsync(url);
  const meshes = [];
  const names = S.names[g.name] || [];
  let i = 0;
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    o.userData.group = g.name;
    o.userData.idx = i;
    o.userData.en = (names[i] || o.name || "").replace(/_/g, " ").replace(/__\d+$/, "").trim() || `جزء ${i + 1}`;
    o.userData.ar = translateAr(o.userData.en);
    i++;
    if (o.material) {
      o.material = o.material.clone();
      o.material.side = THREE.DoubleSide;
      o.material.roughness = 0.6; o.material.metalness = 0.05;
      o.material.transparent = true; o.material.opacity = 1;
      o.userData.baseColor = o.material.color ? o.material.color.clone() : null;
    }
    meshes.push(o);
  });
  S.scene.add(gltf.scene);
  S.loaded[g.name] = { root: gltf.scene, meshes };
  S.visible[g.name] = true;
  return meshes.length;
}

/* ══════════ ③ ترجمة الأسماء ══════════ */
const AR = {
  "Muscular System": "الجهاز العضلي", "Skeletal System": "الجهاز الهيكلي",
  "Nervous System": "الجهاز العصبي", "Circulatory System": "جهاز الدوران",
  "Digestive System": "الجهاز الهضمي", "Respiratory System": "الجهاز التنفسي",
  "Urinary System": "الجهاز البولي", "Reproductive System": "الجهاز التناسلي",
  "Endocrine System": "الجهاز الصمّاوي", "Lymphatic System": "الجهاز اللمفي",
  "heart": "القلب", "brain": "الدماغ", "lung": "الرئة", "liver": "الكبد",
  "kidney": "الكلية", "muscle": "عضلة", "bone": "عظم", "nerve": "عصب",
  "artery": "شريان", "vein": "وريد", "skull": "الجمجمة", "rib": "ضلع",
  "vertebra": "فقرة", "joint": "مفصل", "stomach": "المعدة", "intestine": "الأمعاء",
  "upper": "علوي", "lower": "سفلي", "left": "أيسر", "right": "أيمن",
  "anterior": "أمامي", "posterior": "خلفي", "lateral": "وحشي", "medial": "إنسي",
  "superficial": "سطحي", "deep": "عميق", "portion": "جزء", "body": "جسم",
  "head": "رأس", "neck": "رقبة", "trunk": "جذع", "arm": "ذراع", "leg": "ساق",
  "hand": "يد", "foot": "قدم", "finger": "إصبع", "toe": "إصبع قدم"
};
function translateAr(en) {
  if (!en) return "";
  let out = en;
  for (const [k, v] of Object.entries(AR)) {
    out = out.replace(new RegExp(k, "gi"), v);
  }
  return out;
}

/* ══════════ ④ الاختيار والعزل (pick/isolate) ══════════ */
const ray = new THREE.Raycaster();
function pick(clientX, clientY) {
  const r = $("#cv").getBoundingClientRect();
  const m = new THREE.Vector2(
    ((clientX - r.left) / r.width) * 2 - 1,
    -((clientY - r.top) / r.height) * 2 + 1
  );
  ray.setFromCamera(m, S.camera);
  const targets = [];
  for (const k in S.loaded) if (S.visible[k]) targets.push(...S.loaded[k].meshes);
  const hit = ray.intersectObjects(targets, false)[0];
  if (hit) selectPart(hit.object);
  else clearSelection();
}

function selectPart(mesh) {
  clearSelection();
  S.selected = mesh;
  if (mesh.userData.baseColor) mesh.material.color.set(0xffaa33);
  mesh.material.emissive?.set(0x331100);
  $("#partInfo").classList.add("show");
  $("#partAr").textContent = mesh.userData.ar || mesh.userData.en;
  $("#partEn").textContent = mesh.userData.en;
  $("#partGroup").textContent = mesh.userData.group || "";
  $("#favBtn").classList.toggle("on", S.favorites.has(mesh.userData.en));
}

function clearSelection() {
  if (S.selected && S.selected.userData.baseColor)
    S.selected.material.color.copy(S.selected.userData.baseColor);
  S.selected = null;
  $("#partInfo").classList.remove("show");
}

function isolate(mesh) {
  if (!mesh) return;
  S.isolated = mesh;
  for (const k in S.loaded) {
    for (const m of S.loaded[k].meshes) m.visible = (m === mesh);
  }
  fitTo(mesh);
  $("#isoBtn").classList.add("on");
}
function unisolate() {
  S.isolated = null;
  for (const k in S.loaded)
    for (const m of S.loaded[k].meshes) m.visible = S.visible[k];
  $("#isoBtn").classList.remove("on");
  fit();
}

/* ══════════ ⑤ الملاءمة ══════════ */
function fit() {
  const box = new THREE.Box3();
  for (const k in S.loaded)
    if (S.visible[k]) S.loaded[k].meshes.forEach(m => { if (m.visible) box.expandByObject(m); });
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  S.target.copy(c);
  S.sph.r = size * 1.1;
  S.applyCam();
}
function fitTo(mesh) {
  const box = new THREE.Box3().setFromObject(mesh);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3()).length();
  S.target.copy(c); S.sph.r = s * 1.6; S.applyCam();
}

/* ══════════ ⑥ البحث (AnatomySearchScreen) ══════════ */
function buildIndex() {
  S.index = [];
  for (const k in S.loaded) {
    for (const m of S.loaded[k].meshes) {
      S.index.push({ en: m.userData.en, ar: m.userData.ar, group: k, mesh: m });
    }
  }
  const el = $("#indexN"); if (el) el.textContent = S.index.length.toLocaleString("en-US");
}

function search(q) {
  const box = $("#results");
  if (!q || q.length < 2) { box.innerHTML = ""; box.classList.remove("show"); return; }
  const ql = q.toLowerCase();
  const hits = S.index.filter(x =>
    (x.en && x.en.toLowerCase().includes(ql)) || (x.ar && x.ar.includes(q))
  ).slice(0, 60);
  box.innerHTML = hits.map((h, i) =>
    `<div class="res" data-i="${i}">
       <div class="res-ar">${h.ar || h.en}</div>
       <div class="res-en">${h.en}</div>
     </div>`
  ).join("") || `<div class="res-empty">لا نتائج</div>`;
  box.classList.add("show");
  box.querySelectorAll(".res[data-i]").forEach(el => {
    el.onclick = () => {
      const h = hits[+el.dataset.i];
      selectPart(h.mesh);
      fitTo(h.mesh);
      box.classList.remove("show");
    };
  });
}

/* ══════════ ⑦ الجولات (ActivateTourStep) ══════════ */
const TOURS = [
  {
    id: "heart", ar: "رحلة القلب", icon: "❤️",
    steps: [
      { ar: "القلب عضلة مجوّفة تدفع الدم", q: "heart", view: { theta: 0, phi: 1.4 } },
      { ar: "الأذين الأيمن يستقبل الدم الفقير بالأكسجين", q: "atrium", view: { theta: 0.5, phi: 1.5 } },
      { ar: "البطين الأيسر يضخ إلى الجسم كله", q: "ventricle", view: { theta: -0.5, phi: 1.5 } },
      { ar: "الصمامات تمنع رجوع الدم", q: "valve", view: { theta: 0, phi: 1.6 } }
    ]
  },
  {
    id: "skull", ar: "رحلة الجمجمة", icon: "💀",
    steps: [
      { ar: "الجمجمة تحمي الدماغ", q: "skull", view: { theta: 0, phi: 1.3 } },
      { ar: "الفك السفلي هو العظم الوحيد المتحرك", q: "mandible", view: { theta: 0.3, phi: 1.6 } },
      { ar: "الفقرة الأولى تحمل الجمجمة", q: "vertebra", view: { theta: 0, phi: 1.7 } }
    ]
  },
  {
    id: "resp", ar: "رحلة التنفس", icon: "🫁",
    steps: [
      { ar: "الرئتان تتبادلان الغازات", q: "lung", view: { theta: 0, phi: 1.5 } },
      { ar: "القصبة الهوائية تنقل الهواء", q: "trachea", view: { theta: 0, phi: 1.2 } },
      { ar: "الحجاب الحاجز يسحب الهواء", q: "diaphragm", view: { theta: 0.4, phi: 1.6 } }
    ]
  },
  {
    id: "digest", ar: "رحلة الهضم", icon: "🍽️",
    steps: [
      { ar: "الفم بداية الهضم", q: "mouth", view: { theta: 0, phi: 1.4 } },
      { ar: "المعدة تفرز الحمض", q: "stomach", view: { theta: 0.3, phi: 1.5 } },
      { ar: "الأمعاء تمتص الغذاء", q: "intestine", view: { theta: -0.3, phi: 1.5 } },
      { ar: "الكبد ينقّي الدم", q: "liver", view: { theta: 0, phi: 1.5 } }
    ]
  }
];
let tour = null, tourStep = 0;

function openTours() {
  $("#tourList").innerHTML = TOURS.map(t =>
    `<div class="tour card" data-id="${t.id}">
       <div class="tour-ic">${t.icon}</div>
       <div>
         <div class="tour-ar">${t.ar}</div>
         <div class="tour-n">${t.steps.length} خطوات</div>
       </div>
     </div>`).join("");
  $("#tourList").querySelectorAll(".tour").forEach(el => {
    el.onclick = () => startTour(TOURS.find(t => t.id === el.dataset.id));
  });
  show("#tourSheet");
}

function startTour(t) {
  tour = t; tourStep = 0;
  hide("#tourSheet");
  $("#tourBar").classList.add("show");
  activateStep();
}

function activateStep() {
  if (!tour) return;
  const st = tour.steps[tourStep];
  $("#tourTxt").textContent = st.ar;
  $("#tourProg").textContent = `${tourStep + 1} / ${tour.steps.length}`;
  $("#tourFill").style.width = ((tourStep + 1) / tour.steps.length * 100) + "%";
  // ابحث عن جزء مطابق
  const ql = st.q.toLowerCase();
  const hit = S.index.find(x => x.en && x.en.toLowerCase().includes(ql));
  if (hit) {
    selectPart(hit.mesh);
    fitTo(hit.mesh);
    if (st.view) { S.sph.th = st.view.theta; S.sph.ph = st.view.phi; S.applyCam(); }
  }
}

function nextStep() {
  if (!tour) return;
  if (tourStep < tour.steps.length - 1) { tourStep++; activateStep(); }
  else endTour(true);
}
function endTour(done) {
  if (done) {
    S.progress[tour.id] = true;
    localStorage.setItem("prog", JSON.stringify(S.progress));
  }
  tour = null;
  $("#tourBar").classList.remove("show");
  clearSelection();
  fit();
}

/* ══════════ ⑧ الاختبارات (BeginStartQuiz) ══════════ */
let quiz = null, qIdx = 0, qScore = 0, qAns = [];

function buildQuiz(len = 8) {
  const pool = S.index.filter(x => x.en && x.en.length > 3);
  if (pool.length < 10) return null;
  const picked = [];
  const used = new Set();
  while (picked.length < len && used.size < pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    if (used.has(i)) continue;
    used.add(i);
    const right = pool[i];
    const opts = [right];
    while (opts.length < 4) {
      const j = Math.floor(Math.random() * pool.length);
      if (used.has(j) || opts.some(o => o.en === pool[j].en)) continue;
      opts.push(pool[j]);
    }
    opts.sort(() => Math.random() - 0.5);
    picked.push({ right, opts });
  }
  return picked;
}

function startQuiz() {
  quiz = buildQuiz(8);
  if (!quiz) { alert("انتظر تحميل النماذج"); return; }
  qIdx = 0; qScore = 0; qAns = [];
  renderQ();
}

function renderQ() {
  const q = quiz[qIdx];
  $("#quizN").textContent = `${qIdx + 1} / ${quiz.length}`;
  $("#quizFill").style.width = ((qIdx) / quiz.length * 100) + "%";
  $("#quizQ").textContent = "أي جزء يقابل هذا الاسم؟";
  $("#quizTarget").textContent = q.right.ar || q.right.en;
  // اعزل الجزء الصحيح بصريًا + خلط
  $("#quizOpts").innerHTML = q.opts.map((o, i) =>
    `<button class="qopt" data-i="${i}">${o.en}</button>`
  ).join("");
  $("#quizOpts").querySelectorAll(".qopt").forEach(el => {
    el.onclick = () => answer(+el.dataset.i, el);
  });
}

function answer(i, el) {
  const q = quiz[qIdx];
  const ok = q.opts[i].en === q.right.en;
  if (ok) { qScore++; el.classList.add("ok"); }
  else {
    el.classList.add("bad");
    $("#quizOpts").querySelectorAll(".qopt").forEach(b => {
      if (b.textContent === q.right.en) b.classList.add("ok");
    });
  }
  qAns.push({ q: q.right.en, ok, chose: q.opts[i].en });
  $("#quizOpts").querySelectorAll(".qopt").forEach(b => b.onclick = null);
  setTimeout(() => {
    if (qIdx < quiz.length - 1) { qIdx++; renderQ(); }
    else finishQuiz();
  }, ok ? 700 : 1500);
}

function finishQuiz() {
  const pct = Math.round(qScore / quiz.length * 100);
  S.progress["quiz_" + Date.now()] = pct;
  localStorage.setItem("prog", JSON.stringify(S.progress));
  $("#quizBox").style.display = "none";
  $("#quizRes").innerHTML = `
    <div class="qr-num">${pct}%</div>
    <div class="qr-sub">${qScore} من ${quiz.length} صحيحة</div>
    <div class="qr-list">${qAns.map(a =>
      `<div class="qr-row ${a.ok ? "ok" : "bad"}">
         <span>${a.ok ? "✓" : "✕"}</span>
         <span class="qr-t">${a.q}</span>
       </div>`).join("")}</div>`;
  $("#quizRes").style.display = "block";
}

/* ══════════ ⑨ المفضلة ══════════ */
function toggleFav() {
  if (!S.selected) return;
  const k = S.selected.userData.en;
  if (S.favorites.has(k)) S.favorites.delete(k); else S.favorites.add(k);
  localStorage.setItem("fav", JSON.stringify([...S.favorites]));
  $("#favBtn").classList.toggle("on", S.favorites.has(k));
  renderFavs();
}
function renderFavs() {
  const box = $("#favList");
  if (!S.favorites.size) { box.innerHTML = `<div class="empty">لا مفضلة بعد</div>`; return; }
  box.innerHTML = [...S.favorites].map(en => {
    const h = S.index?.find(x => x.en === en);
    return `<div class="favrow" data-en="${en}">
      <span class="fav-ar">${h ? (h.ar || en) : en}</span>
      <span class="fav-en">${en}</span>
    </div>`;
  }).join("");
  box.querySelectorAll(".favrow").forEach(el => {
    el.onclick = () => {
      const h = S.index?.find(x => x.en === el.dataset.en);
      if (h) { selectPart(h.mesh); fitTo(h.mesh); hide("#favSheet"); }
    };
  });
}

/* ══════════ ⑩ الأدوات ══════════ */
function rotY(d) { S.sph.th += d; S.applyCam(); }
function rotX(d) { S.sph.ph += d; S.applyCam(); }
let animOn = false, animT = 0;
function toggleAnim() {
  animOn = !animOn;
  $("#animBtn").classList.toggle("on", animOn);
  if (animOn) loopAnim();
}
function loopAnim() {
  if (!animOn) return;
  animT += 0.016;
  S.sph.th += 0.006;
  // نبض خفيف
  const p = 1 + Math.sin(animT * 3) * 0.02;
  S.scene.scale.set(p, p, p);
  S.applyCam();
  requestAnimationFrame(loopAnim);
}
function resetView() {
  S.sph.th = 0; S.sph.ph = Math.PI / 2;
  S.scene.scale.set(1, 1, 1);
  fit();
}
function toggleXray() {
  const on = !S.xray;
  S.xray = on;
  for (const k in S.loaded) for (const m of S.loaded[k].meshes) {
    if (m.material) {
      m.material.transparent = true;
      m.material.opacity = on ? 0.35 : 1;
      m.material.depthWrite = !on;
    }
  }
  $("#xrayBtn").classList.toggle("on", on);
}
function toggleSystems() { show("#sysSheet"); }

function renderSysList() {
  const groups = {};
  for (const k in S.loaded) groups[k] = S.loaded[k].meshes.length;
  $("#sysList").innerHTML = Object.keys(groups)
    .sort((a, b) => groups[b] - groups[a])
    .map(k => `<label class="sysrow">
       <input type="checkbox" ${S.visible[k] ? "checked" : ""} data-g="${k}">
       <span class="sys-name">${k.replace("sharedassets", "مجموعة ")}</span>
       <span class="sys-n">${groups[k].toLocaleString("en-US")}</span>
     </label>`).join("");
  $("#sysList").querySelectorAll("input").forEach(inp => {
    inp.onchange = () => {
      const g = inp.dataset.g;
      S.visible[g] = inp.checked;
      for (const m of S.loaded[g].meshes) m.visible = inp.checked;
    };
  });
}

/* ══════════ ⑪ الشرائح والواجهة ══════════ */
function show(sel) { $(sel).classList.add("show"); }
function hide(sel) { $(sel).classList.remove("show"); }

function wireUI() {
  $("#go").onclick = () => {
    $("#gate").style.display = "none";
    setTimeout(() => { fit(); renderSysList(); }, 300);
  };
  $("#searchBtn").onclick = () => { show("#searchSheet"); setTimeout(() => $("#q2").focus(), 100); };
  $("#q2").addEventListener("input", e => search2(e.target.value));
  $("#tourBtn").onclick = openTours;
  $("#quizBtn").onclick = () => {
    $("#quizIntro").style.display = "block";
    $("#quizBox").style.display = "none";
    $("#quizRes").style.display = "none";
    show("#quizSheet");
  };
  $("#favBtn").onclick = toggleFav;
  $("#favOpen").onclick = () => { renderFavs(); show("#favSheet"); };
  $("#isoBtn").onclick = () => S.isolated ? unisolate() : isolate(S.selected);
  $("#animBtn").onclick = toggleAnim;
  $("#resetBtn").onclick = resetView;
  $("#xrayBtn").onclick = toggleXray;
  $("#sysBtn").onclick = () => { renderSysList(); toggleSystems(); };
  $("#tourNext").onclick = nextStep;
  $("#tourEnd").onclick = () => endTour(false);
  $("#quizStart").onclick = () => { $("#quizIntro").style.display="none"; $("#quizBox").style.display="block"; startQuiz(); };
  $("#quizAgain").onclick = () => { $("#quizRes").style.display="none"; $("#quizBox").style.display="block"; startQuiz(); };
  $("#quizClose").onclick = () => hide("#quizSheet");
  // إغلاق النوافذ
  $$("[data-close]").forEach(b => b.onclick = () => hide("#" + b.dataset.close));
  // النقر على المشهد
  const cv = $("#cv");
  let moved = false, sx = 0, sy = 0;
  cv.addEventListener("pointerdown", e => { moved = false; sx = e.clientX; sy = e.clientY; });
  cv.addEventListener("pointermove", e => {
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) moved = true;
  });
  cv.addEventListener("pointerup", e => { if (!moved) pick(e.clientX, e.clientY); });
  // أزرار دوران
  $("#rotL").onclick = () => rotY(-0.3);
  $("#rotR").onclick = () => rotY(0.3);
  $("#rotU").onclick = () => rotX(-0.3);
  $("#rotD").onclick = () => rotX(0.3);
}

function search2(q) {
  const box = $("#results2");
  if (!q || q.length < 2) { box.innerHTML = ""; return; }
  const ql = q.toLowerCase();
  const hits = S.index.filter(x =>
    (x.en && x.en.toLowerCase().includes(ql)) || (x.ar && x.ar.includes(q))
  ).slice(0, 40);
  box.innerHTML = hits.map((h, i) =>
    `<div class="res" data-i="${i}">
       <div class="res-ar">${h.ar || h.en}</div>
       <div class="res-en">${h.en}</div>
     </div>`).join("") || `<div class="res-empty">لا نتائج</div>`;
  box.querySelectorAll(".res[data-i]").forEach(el => {
    el.onclick = () => {
      const h = hits[+el.dataset.i];
      selectPart(h.mesh); fitTo(h.mesh); hide("#searchSheet");
    };
  });
}

/* ══════════ ⑫ البدء ══════════ */
async function boot() {
  const loader = initScene();
  wireUI();
  try {
    const man = await (await fetch("manifest.json")).json();
    S.groups = man.groups; S.names = man.names || {};
    $("#sG").textContent = S.groups.length;
    $("#sT").textContent = (man.total || 0).toLocaleString("en-US");
  } catch (e) {
    $("#progTxt").textContent = "تعذّر تحميل الفهرس";
    return;
  }
  const queue = [...S.groups].sort((a, b) => (b.count || 0) - (a.count || 0));
  let done = 0, total = 0;
  for (const g of queue) {
    try {
      const n = await loadGroup(loader, g);
      if (n) { total += n; done++; }
      $("#progTxt").textContent = `${done}/${queue.length} · ${total.toLocaleString("en-US")} جزء`;
      $("#progBar").style.width = (done / queue.length * 100) + "%";
      $("#sN").textContent = total.toLocaleString("en-US");
      if (done === 1) { buildIndex(); fit(); $("#go").disabled = false; S.ready = true; }
    } catch (e) { console.warn("group fail", g.name, e); }
  }
  buildIndex();
  renderSysList();
  $("#progTxt").textContent = `اكتمل — ${total.toLocaleString("en-US")} جزء`;
  $("#go").disabled = false;
  S.ready = true;
}

boot();
