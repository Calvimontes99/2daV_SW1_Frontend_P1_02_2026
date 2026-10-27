/**
 * Lo que se sabe de cada paso de la guía de Ollama según lo que respondió (o no) Ollama.
 * 'si' | 'no' | 'duda' (no se puede saber todavía) | 'espera' | 'no_hace_falta'.
 *
 * - Si Ollama contesta (aunque sea con 403 por no tener permitida la página), está instalado y
 *   abierto, y el navegador deja llegar a él.
 * - Si no contesta y la página está en internet, puede ser que el navegador lo bloquee: no se
 *   sabe si está instalado.
 */
export const estadoDeLosPasos = (ollama, { conVista = null, enEquipo = false } = {}) => {
  if (!ollama) return null;
  const responde = ollama.disponible || ollama.origenNoPermitido;
  const desconocido = !responde && ollama.bloqueoDelNavegador;
  return {
    instalado: responde ? 'si' : desconocido ? 'duda' : 'no',
    pagina: ollama.disponible ? 'si' : ollama.origenNoPermitido ? 'no' : 'duda',
    navegador: enEquipo ? 'no_hace_falta' : responde ? 'si' : desconocido ? 'no' : 'duda',
    texto: ollama.disponible ? (ollama.modelos.length ? 'si' : 'no') : 'duda',
    vista: ollama.disponible ? (conVista === null ? 'espera' : conVista.length ? 'si' : 'no') : 'duda',
  };
};

export default estadoDeLosPasos;
