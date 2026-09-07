import axios from "axios";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});

export async function fetchScripts() {
  const { data } = await client.get("/scripts");
  return data;
}

export async function createScript(payload) {
  const { data } = await client.post("/scripts", payload);
  return data;
}

export async function updateScript(id, payload) {
  const { data } = await client.put(`/scripts/${id}`, payload);
  return data;
}

export async function deleteScript(id) {
  await client.delete(`/scripts/${id}`);
}

export async function validateScriptName(name) {
  const { data } = await client.get("/scripts/validate", {
    params: { name: name?.trim() },
  });
  return data;
}

export async function fetchNiftyQuote() {
  const { data } = await client.get("/market/nifty");
  return data;
}

export async function fetchDashboardSummary() {
  const { data } = await client.get("/dashboard/summary");
  return data;
}

export async function fetchDashboardMonitoring() {
  const { data } = await client.get("/dashboard/monitoring");
  return data;
}

export async function fetchExecuteDetails(scriptId) {
  const { data } = await client.get(`/execute/${scriptId}`);
  return data;
}

export async function fetchExecuteRows(scriptId) {
  const { data } = await client.get(`/execute/${scriptId}/rows`);
  return data;
}

export async function fetchScriptNews(symbol) {
  const { data } = await client.get(`/news/${encodeURIComponent(symbol)}`);
  return data;
}

export async function fetchCalendar() {
  const { data } = await client.get("/calendar");
  return data;
}

export default client;
