/**
 * Chat sin conexión con el servidor.
 *
 * - Lo que se escribe sin conexión (mensajes al equipo, pedidos a la IA local y lo que respondió)
 *   queda PENDIENTE en el navegador, con un id propio. Al volver se sube a la sala (chat:importar)
 *   y el servidor lo guarda una sola vez aunque se reenvíe.
 * - Una copia de lo último del chat queda en el navegador para leerlo sin conexión, también
 *   después de recargar la página.
 *
 * El almacenamiento del navegador puede fallar (modo privado, cuota llena): nada de esto debe
 * romper el chat, solo se pierde la comodidad.
 */

const MAX_PENDIENTES = 500;
const MAX_CACHE_POR_CANAL = 120;

const leer = (clave) => {
  try { return JSON.parse(localStorage.getItem(clave) || 'null'); } catch { return null; }
};
const escribir = (clave, valor) => {
  try { localStorage.setItem(clave, JSON.stringify(valor)); return true; } catch { return false; }
};

export const nuevoIdLocal = () => `sc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const clavePendientes = (salaId, usuarioId) => `chat.sinConexion.${salaId}.${usuarioId ?? 'anonimo'}`;
const claveCache = (salaId) => `chat.copia.${salaId}`;

export const leerPendientes = (salaId, usuarioId) => {
  const lista = leer(clavePendientes(salaId, usuarioId));
  return Array.isArray(lista) ? lista.filter((e) => e && e.idLocal && e.texto) : [];
};

export const guardarPendientes = (salaId, usuarioId, lista) =>
  escribir(clavePendientes(salaId, usuarioId), (lista || []).slice(-MAX_PENDIENTES));

/** Lo que el servidor confirmó que guardó (o que ya tenía) deja de estar pendiente. */
export const quitarAceptados = (pendientes, aceptados) => {
  const ya = new Set(aceptados || []);
  return (pendientes || []).filter((e) => !ya.has(e.idLocal));
};

/** Un pendiente como mensaje del chat (para mostrarlo junto a los del servidor). */
export const comoMensaje = (e, usuario) => ({
  id: `local:${e.idLocal}`,
  idLocal: e.idLocal,
  tipo: e.tipo,
  canal: e.canal,
  texto: e.texto,
  autorId: e.tipo === 'ia' ? null : usuario?.id ?? null,
  autorNombre: e.tipo === 'ia' ? 'IA local' : usuario?.nombre || 'Tú',
  creadoEn: e.escritoEn,
  datos: {
    ...(e.datos || {}),
    ...(e.tipo === 'ia' ? { proveedor: 'IA local' } : {}),
    sinConexion: true,
    pendiente: true,
    escritoEn: e.escritoEn,
  },
});

/** Lo que se sube al servidor: solo lo necesario (el servidor vuelve a validar todo). */
export const paraSubir = (e) => ({
  idLocal: e.idLocal, tipo: e.tipo, canal: e.canal, texto: e.texto, escritoEn: e.escritoEn, datos: e.datos || {},
});

/** Copia del chat para leerlo sin conexión: los últimos de cada canal, propuestas e historial. */
export const guardarCopiaChat = (salaId, { mensajes = [], propuestas = [], cambios = [], hayAnteriores } = {}) => {
  const porCanal = (canal) => mensajes.filter((m) => (m.canal || 'ia') === canal).slice(-MAX_CACHE_POR_CANAL);
  const recorte = [...porCanal('equipo'), ...porCanal('ia')].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  return escribir(claveCache(salaId), {
    mensajes: recorte, propuestas: propuestas.slice(-30), cambios: cambios.slice(-200), hayAnteriores,
    // Si se recortó un canal, hay anteriores que se pueden pedir al servidor
    recortado: recorte.length < mensajes.length,
  });
};

export const leerCopiaChat = (salaId) => {
  const copia = leer(claveCache(salaId));
  return copia && Array.isArray(copia.mensajes) ? copia : null;
};
