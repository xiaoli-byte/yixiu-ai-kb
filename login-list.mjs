const base = "http://localhost:9999/api";
const login = await fetch(`${base}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@demo.com", password: "demo123" }),
});
const auth = await login.json();
const token = auth.accessToken || auth.data?.accessToken;
if (!token) { console.error("LOGIN FAIL", JSON.stringify(auth).slice(0, 300)); process.exit(1); }
const docs = await fetch(`${base}/documents?page=1&pageSize=30`, {
  headers: { Authorization: `Bearer ${token}` },
}).then(r => r.json());
const items = docs.items || docs.data?.items || [];
console.log("TOKEN_OK");
for (const d of items) console.log(`${d.status}\t${d.title}`);
