// Replace the dashboard's Mock provider with this module after deploying the API.
// Keep PARTNER_API_TOKEN in a secure server-side session/proxy where possible;
// do not hardcode a shared secret into a public React bundle.
export async function fetchPartnerDashboard({ apiBase = import.meta.env.VITE_PARTNER_API_BASE, token }) {
  const response = await fetch(`${apiBase}/api/partner/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Dashboard API failed (${response.status})`);
  return response.json();
}
