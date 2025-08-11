export function preflight(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');
    res.status(200).end();
    return true;
  }
  return false;
}
export function allow(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}
