// Permiso de Ollama para la página: se AGREGA a los ya permitidos (antes se reemplazaba).
import test from 'node:test';
import assert from 'node:assert/strict';
import { comandoPermitirPagina, guionInstalacion, guionPermitirPagina } from '../src/ia-local/ollama.js';

const ORIGEN = 'https://ficctuagrmbolivia.online';

test('permitir la página conserva las ya permitidas y reinicia Ollama (Windows)', () => {
  const g = guionPermitirPagina({ origen: ORIGEN, windows: true });
  assert.equal(g.nombre, 'permitir-ollama.bat');
  assert.doesNotMatch(g.contenido, /setx OLLAMA_ORIGINS/, 'setx reemplaza el valor anterior');
  assert.match(g.contenido, /GetEnvironmentVariable\('OLLAMA_ORIGINS','User'\)/);
  assert.match(g.contenido, new RegExp(`-notcontains '${ORIGEN.replaceAll('.', '\\.')}'`));
  assert.match(g.contenido, /ollama app\.exe/);
  assert.ok(g.contenido.includes('\r\n'), 'fin de línea de Windows');
  assert.doesNotMatch(g.contenido, /ollama pull/, 'no descarga modelos');
});

test('el instalador también agrega la página en vez de reemplazar', () => {
  const g = guionInstalacion({ origen: ORIGEN, modelo: 'qwen2.5:7b', windows: true });
  assert.doesNotMatch(g.contenido, /setx OLLAMA_ORIGINS/);
  assert.match(g.contenido, /-notcontains/);
  const unix = guionInstalacion({ origen: ORIGEN, modelo: 'qwen2.5:7b', windows: false });
  assert.match(unix.contenido, /case ",\$\{OLLAMA_ORIGINS:-\}," in/);
});

test('el comando para pegar en una terminal agrega la página sin borrar las anteriores', () => {
  const c = comandoPermitirPagina(ORIGEN);
  assert.match(c, /^powershell -NoProfile -Command "/);
  assert.match(c, /\$l\+='https:\/\/ficctuagrmbolivia\.online'/);
  assert.match(g2(), /launchctl setenv OLLAMA_ORIGINS/);
});

function g2() { return guionPermitirPagina({ origen: ORIGEN, windows: false }).contenido; }

test('el configurador hace solo lo que falta: instala si no está, permite, reinicia y baja modelos que falten', async () => {
  const { guionConfigurar, guionModelos } = await import('../src/ia-local/ollama.js');
  const g = guionConfigurar({ origen: ORIGEN, modelo: 'qwen2.5:7b', modeloVista: 'qwen2.5vl:7b', windows: true });
  assert.equal(g.nombre, 'configurar-ollama.bat');
  assert.ok(g.contenido.includes(String.raw`if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" goto :instalado`));
  // Solo baja modelos si la PC no tiene uno que sirva (cualquiera para texto; con vista para fotos)
  assert.match(g.contenido, /findstr \/v \/b \/c:"NAME"/);
  assert.match(g.contenido, /findstr \/i "vl llava gemma3 moondream vision minicpm-v"/);
  assert.match(g.contenido, /pull qwen2\.5:7b/);
  assert.match(g.contenido, /pull qwen2\.5vl:7b/);
  assert.match(g.contenido, /:esperar_ollama/, 'espera a que Ollama conteste antes de bajar modelos');
  assert.match(g.contenido, /Acceso a la red local/, 'explica el paso del navegador');
  assert.doesNotMatch(g.contenido, /setx OLLAMA_ORIGINS/);
  // Dentro de un bloque ( ... ) de cmd, un paréntesis en el texto lo corta: no debe haber
  for (const linea of g.contenido.split('\r\n').filter((l) => /^if .*\(echo /.test(l))) {
    const textos = [...linea.matchAll(/\(echo ([^)]*)\)/g)].map((m) => m[1]);
    assert.ok(textos.every((x) => !x.includes('(')), linea);
  }
  const m = guionModelos({ modelo: 'qwen2.5:7b', modeloVista: null, windows: true });
  assert.equal(m.nombre, 'modelos-ollama.bat');
  assert.match(m.contenido, /OLLAMA_ORIGINS=%%v/, 'abre Ollama con la lista de páginas al día');
  assert.doesNotMatch(m.contenido, /qwen2\.5vl/);
});

test('la guía dice qué falta según lo que respondió Ollama', async () => {
  globalThis.window ??= { location: { origin: ORIGEN, hostname: 'ficctuagrmbolivia.online' } };
  globalThis.navigator ??= { userAgent: 'Windows' };
  const { estadoDeLosPasos } = await import('../src/components/estadoGuiaOllama.js');
  assert.deepEqual(estadoDeLosPasos({ disponible: false, origenNoPermitido: true, modelos: [] }),
    { instalado: 'si', pagina: 'no', navegador: 'si', texto: 'duda', vista: 'duda' });
  assert.deepEqual(estadoDeLosPasos({ disponible: false, bloqueoDelNavegador: true, modelos: [] }),
    { instalado: 'duda', pagina: 'duda', navegador: 'no', texto: 'duda', vista: 'duda' });
  assert.deepEqual(estadoDeLosPasos({ disponible: true, modelos: [{ nombre: 'qwen2.5:7b' }] }, { conVista: [], enEquipo: true }),
    { instalado: 'si', pagina: 'si', navegador: 'no_hace_falta', texto: 'si', vista: 'no' });
  assert.equal(estadoDeLosPasos(null), null);
});
