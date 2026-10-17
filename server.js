const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'PROMENI-OVO-U-TAJNI-KLJUC-PRE-OBJAVE';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const uploadDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const db = new Database(path.join(dataDir, 'mojoglas.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ads (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id),
 title TEXT NOT NULL,
 description TEXT NOT NULL,
 price REAL NOT NULL DEFAULT 0,
 category TEXT NOT NULL,
 city TEXT NOT NULL,
 phone TEXT DEFAULT '',
 image TEXT DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(uploadDir));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  name: 'mojoglas.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7*24*60*60*1000 }
}));

const storage = multer.diskStorage({
 destination: (_, __, cb) => cb(null, uploadDir),
 filename: (_, file, cb) => cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 9) + path.extname(file.originalname).toLowerCase())
});
const upload = multer({
 storage,
 limits: { fileSize: 5 * 1024 * 1024, files: 1 },
 fileFilter: (_, file, cb) => cb(null, ['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype))
});

function esc(v='') {
 return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function userIsAdmin(req) {
 return !!(req.session.user && ADMIN_EMAIL && req.session.user.email === ADMIN_EMAIL);
}
function currentUser(req) {
 if (!req.session.user) return null;
 return { ...req.session.user, isAdmin: userIsAdmin(req) };
}
function needLogin(req, res, next) {
 if (!req.session.user) return res.status(401).json({error:'Prijavi se da bi nastavio.'});
 next();
}
function needAdmin(req, res, next) {
 if (!userIsAdmin(req)) return res.status(403).json({error:'Samo administrator može ovo da uradi.'});
 next();
}
app.get('/api/me', (req,res) => res.json({user: currentUser(req)}));
app.post('/api/register', async (req,res) => {
 const name = String(req.body.name || '').trim();
 const email = String(req.body.email || '').trim().toLowerCase();
 const password = String(req.body.password || '');
 if (name.length < 2 || name.length > 70) return res.status(400).json({error:'Ime mora imati od 2 do 70 znakova.'});
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Unesi ispravnu email adresu.'});
 if (password.length < 8) return res.status(400).json({error:'Lozinka mora imati najmanje 8 znakova.'});
 try {
   const hash = await bcrypt.hash(password, 12);
   const info = db.prepare('INSERT INTO users (name,email,password_hash) VALUES (?,?,?)').run(name,email,hash);
   req.session.user = {id:Number(info.lastInsertRowid), name, email};
   res.json({user:currentUser(req)});
 } catch(e) {
   res.status(400).json({error: e.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'Ovaj email je već registrovan.' : 'Registracija nije uspela.'});
 }
});
app.post('/api/login', async (req,res) => {
 const email = String(req.body.email || '').trim().toLowerCase();
 const password = String(req.body.password || '');
 const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
 if (!user || !(await bcrypt.compare(password,user.password_hash))) return res.status(401).json({error:'Email ili lozinka nisu tačni.'});
 req.session.regenerate(err => {
   if (err) return res.status(500).json({error:'Nešto nije uspelo. Pokušaj ponovo.'});
   req.session.user = {id:user.id,name:user.name,email:user.email};
   res.json({user:currentUser(req)});
 });
});
app.post('/api/logout', (req,res) => req.session.destroy(() => res.json({ok:true})));

app.get('/api/ads', (req,res) => {
 const q = String(req.query.q || '').trim().slice(0,100);
 const category = String(req.query.category || '').trim().slice(0,60);
 const city = String(req.query.city || '').trim().slice(0,80);
 const rows = db.prepare(`
 SELECT ads.id, ads.title, ads.description, ads.price, ads.category, ads.city, ads.phone, ads.image, ads.created_at, users.name AS seller
 FROM ads JOIN users ON users.id=ads.user_id
 WHERE ads.status='approved'
 AND (?='' OR ads.title LIKE ? OR ads.description LIKE ?)
 AND (?='' OR ads.category=?)
 AND (?='' OR ads.city LIKE ?)
 ORDER BY ads.id DESC LIMIT 100
 `).all(q,`%${q}%`,`%${q}%`,category,category,city,`%${city}%`);
 res.json({ads:rows});
});
app.get('/api/my-ads', needLogin, (req,res) => {
 const rows = db.prepare(`SELECT id,title,description,price,category,city,phone,image,status,created_at FROM ads WHERE user_id=? ORDER BY id DESC`).all(req.session.user.id);
 res.json({ads:rows});
});
app.post('/api/ads', needLogin, upload.single('image'), (req,res) => {
 const title = String(req.body.title || '').trim();
 const description = String(req.body.description || '').trim();
 const category = String(req.body.category || '').trim();
 const city = String(req.body.city || '').trim();
 const phone = String(req.body.phone || '').trim().slice(0,40);
 const price = Number(req.body.price);
 if (title.length < 4 || title.length > 100) return res.status(400).json({error:'Naslov mora imati od 4 do 100 znakova.'});
 if (description.length < 10 || description.length > 5000) return res.status(400).json({error:'Opis mora imati od 10 do 5.000 znakova.'});
 if (!category || category.length > 60) return res.status(400).json({error:'Izaberi kategoriju.'});
 if (city.length < 2 || city.length > 80) return res.status(400).json({error:'Unesi grad.'});
 if (!Number.isFinite(price) || price < 0 || price > 100000000000) return res.status(400).json({error:'Unesi ispravnu cenu.'});
 const image = req.file ? '/uploads/' + req.file.filename : '';
 const info = db.prepare(`INSERT INTO ads (user_id,title,description,price,category,city,phone,image,status) VALUES (?,?,?,?,?,?,?,?, 'pending')`)
 .run(req.session.user.id,title,description,price,category,city,phone,image);
 res.json({ok:true,id:Number(info.lastInsertRowid),message:'Oglas je poslat na proveru. Biće vidljiv nakon odobrenja administratora.'});
});
app.patch('/api/ads/:id', needLogin, (req,res) => {
 const id = Number(req.params.id);
 const ad = db.prepare('SELECT * FROM ads WHERE id=?').get(id);
 if (!ad || ad.user_id !== req.session.user.id) return res.status(404).json({error:'Oglas nije pronađen.'});
 const title = String(req.body.title || '').trim();
 const description = String(req.body.description || '').trim();
 const price = Number(req.body.price);
 if (title.length < 4 || title.length > 100 || description.length < 10 || description.length > 5000 || !Number.isFinite(price) || price < 0)
  return res.status(400).json({error:'Proveri naslov, opis i cenu.'});
 db.prepare('UPDATE ads SET title=?,description=?,price=?,status=? WHERE id=?').run(title,description,price,'pending',id);
 res.json({ok:true,message:'Izmene su sačuvane i poslate na proveru.'});
});
app.delete('/api/ads/:id', needLogin, (req,res) => {
 const ad = db.prepare('SELECT * FROM ads WHERE id=?').get(Number(req.params.id));
 if (!ad || (ad.user_id !== req.session.user.id && !userIsAdmin(req))) return res.status(404).json({error:'Oglas nije pronađen.'});
 db.prepare('DELETE FROM ads WHERE id=?').run(ad.id);
 if (ad.image) {
   const file = path.join(uploadDir,path.basename(ad.image));
   if (fs.existsSync(file)) fs.unlinkSync(file);
 }
 res.json({ok:true});
});
app.get('/api/admin/ads', needLogin, needAdmin, (req,res) => {
 const ads = db.prepare(`SELECT ads.*, users.name AS seller, users.email AS seller_email FROM ads JOIN users ON users.id=ads.user_id ORDER BY ads.id DESC`).all();
 res.json({ads});
});
app.patch('/api/admin/ads/:id', needLogin, needAdmin, (req,res) => {
 const status = String(req.body.status || '');
 if (!['approved','rejected','pending'].includes(status)) return res.status(400).json({error:'Nevažeći status.'});
 const info = db.prepare('UPDATE ads SET status=? WHERE id=?').run(status,Number(req.params.id));
 if (!info.changes) return res.status(404).json({error:'Oglas nije pronađen.'});
 res.json({ok:true});
});
app.get('*', (req,res) => res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT, () => {
 console.log(`MojOglas radi na http://localhost:${PORT}`);
 if (!ADMIN_EMAIL || !ADMIN_PASSWORD) console.warn('ADMIN_EMAIL i ADMIN_PASSWORD nisu podešeni: administracija nije dostupna dok ih ne podesiš.');
});
