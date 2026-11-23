export const demoMode = process.env.DEMO_MODE === 'true';
export const demoShopName = 'Al-Raiyan Sample Demo';

// Keep shared sample logins usable and prevent visitors from saving contacts
// or exporting credential hashes. Billing and stock demonstrations still work.
export function protectDemo(req, res, next) {
  if (!demoMode) return next();
  const path = req.path.toLowerCase().replace(/\/+$/, '');
  const blocked = path === '/auth/password' || path === '/backups' ||
    (path === '/settings' && !['GET', 'HEAD'].includes(req.method)) ||
    (path.startsWith('/users') && !['GET', 'HEAD'].includes(req.method)) ||
    (['/customers', '/suppliers'].includes(path) && req.method === 'POST');
  if (blocked) return res.status(403).json({error: 'This is a sample demo. Account changes, shop settings, backups, and new contacts are disabled. Use the sample customer and supplier.'});
  next();
}

// Refuse accidental demo seeding into an existing, unmarked shop database.
export async function checkDemoDatabase(db) {
  if (!demoMode) return;
  if (process.env.SEED_SAMPLE_DATA !== 'true') throw new Error('DEMO_MODE requires SEED_SAMPLE_DATA=true.');
  const shop = await db.setting.findUnique({where: {id: 'shop'}});
  if (shop?.shopName === demoShopName) return;
  const counts = await Promise.all(['setting', 'user', 'product', 'sale', 'customer', 'supplier', 'expense', 'article'].map(model => db[model].count()));
  if (counts.some(Boolean)) throw new Error('Demo setup refused: use a new empty database dedicated to sample data.');
}
