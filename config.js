// Configuración de conexión a Supabase.
// La anon key es PÚBLICA por diseño (va en el cliente); los datos están protegidos por RLS.
export const SUPABASE_URL = "https://vmfmvhdenrslfkjysatc.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtZm12aGRlbnJzbGZranlzYXRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NTc4MTEsImV4cCI6MjA5NjMzMzgxMX0.JrQjOocEX-lZ1ZJOSbQGHFOIA6nX9K0XKiBxRySfcJs";

// Client ID de la app de Strava. Es PÚBLICO (viaja en la URL de autorización); el
// CLIENT SECRET vive solo en los secretos de la Edge Function, nunca aquí.
// Lo tienes en https://www.strava.com/settings/api -> "Client ID".
// Mientras esté vacío, el botón "Conectar Strava" sale deshabilitado con un aviso.
export const STRAVA_CLIENT_ID = "144134";
