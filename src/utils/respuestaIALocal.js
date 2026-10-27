import { EJEMPLOS_ORDENES } from '../ia-local/interpreteOrdenes.js';

/**
 * Lo que la IA local responde en el chat, a partir del resultado de resolverConIALocal o de
 * leerImagenConIALocal. `abrirPanel`: falta un modelo y conviene ofrecer el panel de la IA local.
 */
const comoLoHizo = (r) => {
  if (r.motor === 'ollama' || r.motor === 'ollama-vista') return `Ollama en tu equipo · ${r.modeloUsado}`;
  if (r.motor === 'modelo') return 'modelo de lenguaje del navegador';
  return 'intérprete de órdenes';
};

export const respuestaDeIALocal = (r) => {
  const lineas = [];
  if (r.cambios > 0) {
    lineas.push(`💻 Hecho con la IA local (${comoLoHizo(r)}):`);
    (r.resumen || []).forEach((x) => lineas.push(`- ${x}`));
  }
  (r.avisos || []).forEach((a) => lineas.push(`⚠️ ${a}`));
  const noEntendidas = r.noEntendidas || [];
  const faltaModelo = noEntendidas.length > 0 && !r.modeloDisponible;
  if (noEntendidas.length) {
    lineas.push(`No entendí: ${noEntendidas.map((f) => `"${f}"`).join(', ')}.`);
    if (faltaModelo) {
      lineas.push(`Para pedidos libres descarga un modelo en **💻 IA local**. Sin modelo entiendo órdenes como: ${EJEMPLOS_ORDENES.slice(0, 3).map((e) => `"${e}"`).join(', ')}.`);
    }
  }
  if (r.errorModelo) lineas.push(`(El modelo local falló: ${r.errorModelo})`);
  if (!lineas.length) lineas.push('No hubo cambios en el diagrama.');
  return {
    texto: lineas.join('\n'),
    datos: { motor: r.motor || 'interprete', ...(r.modeloUsado ? { modeloUsado: r.modeloUsado } : {}), cambios: r.cambios || 0 },
    abrirPanel: faltaModelo,
  };
};

export const respuestaDeImagenLocal = (r) => {
  if (!r.disponible) return { texto: r.motivo || 'No se pudo leer la imagen sin conexión.', datos: { motor: 'ollama-vista', cambios: 0 }, abrirPanel: true };
  const lineas = [];
  if (r.cambios > 0) {
    lineas.push(`💻 Leído sin internet con Ollama · ${r.modeloUsado}:`);
    (r.resumen || []).forEach((x) => lineas.push(`- ${x}`));
    lineas.push('Revisa las relaciones y las cardinalidades: un modelo local las falla más que los nombres.');
  } else if (r.motivo) {
    lineas.push(r.motivo);
  }
  (r.avisos || []).forEach((a) => lineas.push(`⚠️ ${a}`));
  if (r.noEntendidas?.length) lineas.push(`No entendí: ${r.noEntendidas.map((f) => `"${f}"`).join(', ')}.`);
  return {
    texto: lineas.join('\n') || 'No hubo cambios en el diagrama.',
    datos: { motor: 'ollama-vista', ...(r.modeloUsado ? { modeloUsado: r.modeloUsado } : {}), cambios: r.cambios || 0 },
    abrirPanel: false,
  };
};

/** Sugerencias para el chat de la IA cuando se trabaja sin conexión (lo que entiende la IA local). */
export const SUGERENCIAS_SIN_CONEXION = EJEMPLOS_ORDENES.slice(0, 3);
