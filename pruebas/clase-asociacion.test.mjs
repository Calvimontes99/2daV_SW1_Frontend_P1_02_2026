// Clases de asociación: crearlas, unirlas a una relación, quitarlas, limpiar lo que queda
// suelto al borrar y traerlas desde un proyecto de Enterprise Architect (.EAP).
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  admiteClaseAsociacion, claseAsociacionDe, crearClaseAsociacion, desvincularClaseAsociacion,
  idLineaPunteada, normalizarClasesAsociacion, relacionesParaClase, vincularClaseAsociacion,
} = await import('../src/utils/claseAsociacion.js');
const { prepararImportacionEAP } = await import('../src/utils/eapImporter.js');
const { tamanoNodo } = await import('../src/utils/distribucionImportada.js');
const { buildExportXML } = await import('../src/utils/myCustomXmlFunctions.js');
const { montarSocketFlow } = await import('./hookSimulado.mjs');

const clase = (id, x = 0, y = 0, extra = {}) => ({
  id, type: 'classNode', position: { x, y }, data: { className: id, attributes: ['id: int'], methods: [], ...extra },
});
const relacion = (id, source, target, type = 'Association') => ({
  id, source, target, type: 'umlEdge', data: { type, startLabel: '1..*', endLabel: '1..*' },
});
const tableroBase = () => ({
  nodes: [clase('Alumno', 0, 0), clase('Curso', 800, 0), clase('Inscripcion', 400, 400)],
  edges: [relacion('cursa', 'Alumno', 'Curso'), relacion('hereda', 'Alumno', 'Curso', 'Generalization')],
});

/** Las tres marcas de la clase de asociación, como las leen el generador y los exportadores. */
const comprobarVinculo = (tablero, claseId, relacionId) => {
  const nodo = tablero.nodes.find((n) => n.id === claseId);
  const arista = tablero.edges.find((e) => e.id === relacionId);
  const lineas = tablero.edges.filter((e) => e.data?.isAssociationConnection);
  assert.equal(nodo.data.isAssociationClass, true);
  assert.equal(nodo.data.associatedEdgeId, relacionId);
  assert.equal(arista.data.hasAssociationClass, true);
  assert.equal(arista.data.associationClassNodeId, claseId);
  assert.equal(claseAsociacionDe(arista), claseId);
  assert.equal(lineas.length, 1, 'una sola línea punteada');
  assert.equal(lineas[0].id, idLineaPunteada(relacionId));
  assert.equal(lineas[0].source, claseId);
  assert.equal(lineas[0].data.parentRelationId, relacionId);
};

test('solo las asociaciones (también agregación y composición) admiten clase de asociación', () => {
  const t = tableroBase();
  assert.equal(admiteClaseAsociacion(t.edges[0]), true);
  assert.equal(admiteClaseAsociacion(t.edges[1]), false);
  assert.equal(admiteClaseAsociacion(relacion('x', 'a', 'b', 'Composition')), true);
  assert.equal(admiteClaseAsociacion({ id: 'y', source: 'a', target: 'b', data: {} }), true, 'sin tipo es asociación');
  assert.throws(() => crearClaseAsociacion(t, 'hereda'), /asociación/);
});

/** La clase nueva no se encima con otra clase ni tapa el punto medio de la relación. */
const comprobarLugarLibre = (nodes, nodo, relacionId, edges) => {
  const caja = (n) => ({ ...n.position, ...(n.measured ? { ancho: n.measured.width, alto: n.measured.height } : tamanoNodo(n.data)) });
  const a = caja(nodo);
  for (const otro of nodes.filter((n) => n.id !== nodo.id)) {
    const b = caja(otro);
    const encima = a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto;
    assert.equal(encima, false, `${nodo.data.className} queda encima de ${otro.data.className}`);
  }
  const r = edges.find((e) => e.id === relacionId);
  const [o, d] = [r.source, r.target].map((id) => caja(nodes.find((n) => n.id === id)));
  const medio = { x: (o.x + o.ancho / 2 + d.x + d.ancho / 2) / 2, y: (o.y + o.alto / 2 + d.y + d.alto / 2) / 2 };
  const tapa = medio.x > a.x && medio.x < a.x + a.ancho && medio.y > a.y && medio.y < a.y + a.alto;
  assert.equal(tapa, false, 'no tapa el punto medio de la línea');
};

test('crear una clase de asociación deja las tres marcas y no tapa las clases', () => {
  const t = tableroBase();
  const { nodes, edges, nodo } = crearClaseAsociacion(t, 'cursa', { id: 'ac1' });
  assert.equal(nodo.data.className, 'ClaseAsociacion1');
  comprobarVinculo({ nodes, edges }, 'ac1', 'cursa');
  comprobarLugarLibre(nodes, nodo, 'cursa', edges);
  assert.equal(t.nodes.length, 3, 'no modifica el tablero recibido');
  assert.throws(() => crearClaseAsociacion({ nodes, edges }, 'cursa'), /ya tiene/);
  // El nombre siguiente no repite
  const otra = crearClaseAsociacion(
    { nodes: [...nodes, clase('A2', 0, 900), clase('B2', 900, 900)], edges: [...edges, relacion('r2', 'A2', 'B2')] },
    'r2', { id: 'ac2' });
  assert.equal(otra.nodo.data.className, 'ClaseAsociacion2');
});

test('entre clases muy juntas busca un hueco libre (caso del tablero importado de EA)', () => {
  // Medidas reales de "Class Model": entre recorridos y lineas quedan 308 px y una clase mide 340
  const medida = (n, width, height) => ({ ...n, measured: { width, height } });
  const t = {
    nodes: [
      medida(clase('microbuses', 798, 161), 340, 278),
      medida(clase('recorridos', 123, 739), 340, 345),
      medida(clase('lineas', 771, 728), 340, 367),
      medida(clase('conductores', 101, 152), 340, 365),
    ],
    edges: [relacion('realiza', 'microbuses', 'recorridos'), relacion('realiza2', 'lineas', 'recorridos')],
  };
  for (const relacionId of ['realiza', 'realiza2']) {
    const { nodes, edges, nodo } = crearClaseAsociacion(t, relacionId, { id: `ac-${relacionId}` });
    comprobarLugarLibre(nodes, nodo, relacionId, edges);
  }
});

test('una clase existente se une a una relación y se puede quitar sin borrarla', () => {
  let t = tableroBase();
  assert.deepEqual(relacionesParaClase(t.nodes, t.edges, 'Inscripcion').map((r) => r.id), ['cursa']);
  assert.deepEqual(relacionesParaClase(t.nodes, t.edges, 'Alumno'), [], 'un extremo no puede ser su clase');
  assert.throws(() => vincularClaseAsociacion(t, 'Alumno', 'cursa'), /extremos/);

  t = vincularClaseAsociacion(t, 'Inscripcion', 'cursa');
  comprobarVinculo(t, 'Inscripcion', 'cursa');
  // Volver a vincular no duplica la línea punteada
  t = vincularClaseAsociacion(t, 'Inscripcion', 'cursa');
  comprobarVinculo(t, 'Inscripcion', 'cursa');

  t = desvincularClaseAsociacion(t, 'cursa');
  assert.ok(t.nodes.some((n) => n.id === 'Inscripcion'), 'la clase sigue en el tablero');
  assert.equal(t.nodes.find((n) => n.id === 'Inscripcion').data.isAssociationClass, undefined);
  assert.equal(t.edges.find((e) => e.id === 'cursa').data.hasAssociationClass, undefined);
  assert.equal(t.edges.some((e) => e.data?.isAssociationConnection), false);
});

test('mover la clase a otra relación suelta la anterior', () => {
  let t = tableroBase();
  t.nodes.push(clase('Profesor', 0, 800));
  t.edges.push(relacion('dicta', 'Profesor', 'Curso'));
  t = vincularClaseAsociacion(t, 'Inscripcion', 'cursa');
  t = vincularClaseAsociacion(t, 'Inscripcion', 'dicta');
  comprobarVinculo(t, 'Inscripcion', 'dicta');
  assert.equal(t.edges.find((e) => e.id === 'cursa').data.hasAssociationClass, undefined);
});

test('borrar la clase, la relación o cambiar su tipo no deja marcas sueltas', () => {
  const vinculado = vincularClaseAsociacion(tableroBase(), 'Inscripcion', 'cursa');
  assert.equal(normalizarClasesAsociacion(vinculado), vinculado, 'sin cambios devuelve el mismo objeto');

  // Se borra la clase (React Flow quita también su línea punteada, o no: da igual)
  const sinClase = normalizarClasesAsociacion({ nodes: vinculado.nodes.filter((n) => n.id !== 'Inscripcion'), edges: vinculado.edges });
  assert.equal(sinClase.edges.find((e) => e.id === 'cursa').data.hasAssociationClass, undefined);
  assert.equal(sinClase.edges.some((e) => e.data?.isAssociationConnection), false);

  // Se borra la relación: la clase vuelve a ser común y la línea punteada desaparece
  const sinRelacion = normalizarClasesAsociacion({ nodes: vinculado.nodes, edges: vinculado.edges.filter((e) => e.id !== 'cursa') });
  assert.equal(sinRelacion.nodes.find((n) => n.id === 'Inscripcion').data.isAssociationClass, undefined);
  assert.equal(sinRelacion.edges.some((e) => e.data?.isAssociationConnection), false);

  // La asociación pasa a herencia
  const herencia = normalizarClasesAsociacion({
    nodes: vinculado.nodes,
    edges: vinculado.edges.map((e) => (e.id === 'cursa' ? { ...e, data: { ...e.data, type: 'Generalization' } } : e)),
  });
  assert.equal(herencia.nodes.find((n) => n.id === 'Inscripcion').data.isAssociationClass, undefined);
  assert.equal(herencia.edges.find((e) => e.id === 'cursa').data.hasAssociationClass, undefined);

  // Marca a medias de una versión anterior (relación marcada sin clase)
  const aMedias = { nodes: tableroBase().nodes, edges: [{ ...relacion('cursa', 'Alumno', 'Curso'), data: { type: 'Association', hasAssociationClass: true } }] };
  assert.equal(normalizarClasesAsociacion(aMedias).edges[0].data.hasAssociationClass, undefined);
});

test('en el tablero sincronizado, borrar la relación suelta la clase también en el servidor', () => {
  const inicial = vincularClaseAsociacion(tableroBase(), 'Inscripcion', 'cursa');
  const tablero = montarSocketFlow({ inicial });
  // Lo que hace React Flow al borrar la línea seleccionada con la tecla Supr
  tablero.hook.setEdges((aristas) => aristas.filter((e) => e.id !== 'cursa'));
  tablero.correr(50);
  const inscripcion = tablero.servidor.nodes.find((n) => n.id === 'Inscripcion');
  assert.ok(inscripcion, 'la clase no se borra');
  assert.equal(inscripcion.data.isAssociationClass, undefined, 'vuelve a ser una clase común');
  assert.equal(tablero.servidor.edges.some((e) => e.data?.isAssociationConnection), false, 'sin línea punteada huérfana');
  assert.deepEqual(tablero.servidor.edges.map((e) => e.id), ['hereda']);
});

test('el .EAP trae la clase de asociación unida a su relación (NType 17 / SubType Class)', () => {
  // Modelo como lo devuelve POST /apis/importar/eap con el proyecto del usuario
  const modelo = {
    paquetes: [{ id: 5, nombre: 'Class Model', padre: 1 }],
    clases: [
      { id: 60, tipo: 'Class', nombre: 'chofer', atributos: [{ nombre: 'codigo', visibilidad: 'private', tipo: 'int' }], operaciones: [] },
      { id: 43, tipo: 'Class', nombre: 'lineas', atributos: [{ nombre: 'id', visibilidad: 'private', tipo: 'int' }], operaciones: [] },
      { id: 62, tipo: 'Class', nombre: 'LineasDetalle', atributos: [{ nombre: 'idLinea', visibilidad: 'private', tipo: 'int' }], operaciones: [] },
    ],
    conectores: [{
      id: 35, tipo: 'Association', subtipo: 'Class', nombre: '', origen: 60, destino: 43,
      cardOrigen: '1..*', cardDestino: '1..*', rolOrigen: '', rolDestino: '', agregadoOrigen: 0, agregadoDestino: 0,
      claseAsociacion: 62,
    }],
    diagramas: [{
      id: 5, nombre: 'Class Model', tipo: 'Logical', paquete: 5, nombrePaquete: 'Class Model', conectoresOcultos: [],
      objetos: [
        { clase: 60, left: 290, top: 680, right: 405, bottom: 760 },
        { clase: 43, left: 370, top: 315, right: 540, bottom: 540 },
        { clase: 62, left: 490, top: 605, right: 615, bottom: 690 },
      ],
    }],
  };
  const { nodes, edges } = prepararImportacionEAP(modelo).construir('diagrama:5');
  comprobarVinculo({ nodes, edges }, 'node-eap-62', 'edge-eap-35');
  assert.equal(edges.filter((e) => !e.data.isAssociationConnection).length, 1, 'una sola relación chofer—lineas');
  assert.equal(normalizarClasesAsociacion({ nodes, edges }).edges, edges, 'llega ya consistente');

  // Si el diagrama no muestra la clase de asociación, la relación llega sin ella
  const sinClase = prepararImportacionEAP({
    ...modelo,
    diagramas: [{ ...modelo.diagramas[0], objetos: modelo.diagramas[0].objetos.filter((o) => o.clase !== 62) }],
  }).construir('diagrama:5');
  assert.equal(sinClase.edges.some((e) => e.data.hasAssociationClass || e.data.isAssociationConnection), false);
});

// ---------- Exportación a XMI: la clase y su asociación salen como una uml:AssociationClass ----------

/** El elemento packagedElement (con su contenido) cuyo xmi:id es `id`. */
const elementoXmi = (xml, id) => {
  const inicio = xml.search(new RegExp(`<packagedElement [^>]*xmi:id="${id}"`));
  if (inicio < 0) return null;
  const apertura = xml.slice(inicio, xml.indexOf('>', inicio) + 1);
  if (apertura.endsWith('/>')) return apertura;
  return xml.slice(inicio, xml.indexOf('</packagedElement>', inicio) + '</packagedElement>'.length);
};
const idDeClase = (xml, nombre) => new RegExp(`xmi:type="uml:(?:Class|AssociationClass)" xmi:id="([^"]+)" name="${nombre}"`).exec(xml)[1];

for (const version of ['2.5.1', '2.1']) {
  test(`XMI ${version}: la clase de asociación sale como uml:AssociationClass con los extremos de su relación`, () => {
    const t = vincularClaseAsociacion(tableroBase(), 'Inscripcion', 'cursa');
    const xml = buildExportXML(t.nodes, t.edges, version, 'Academia');
    const [alumno, curso, inscripcion] = ['Alumno', 'Curso', 'Inscripcion'].map((n) => idDeClase(xml, n));
    const ac = elementoXmi(xml, inscripcion);
    assert.match(ac, /^<packagedElement xmi:type="uml:AssociationClass"/);
    assert.match(ac, /<ownedAttribute [^>]*name="id"/, 'conserva sus atributos');
    assert.equal((ac.match(/<memberEnd /g) || []).length, 2);
    const extremos = [...ac.matchAll(/<ownedEnd [^>]*association="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(extremos, [inscripcion, inscripcion], 'los extremos pertenecen a la misma AssociationClass');
    // El tipo del extremo va como atributo (2.5.1) o como hijo <type xmi:idref> (2.1, como EA)
    const tipos = ac.split('<ownedEnd ').slice(1).map((trozo) => {
      const extremo = trozo.split('</ownedEnd>')[0];
      return (/ type="([^"]+)"/.exec(extremo) || /<type xmi:idref="([^"]+)"/.exec(extremo))[1];
    }).sort();
    assert.deepEqual(tipos, [alumno, curso].sort(), 'une a Alumno y Curso');
    assert.equal((ac.match(/value="\*"/g) || []).length, 2, 'con sus cardinalidades 1..*');
    assert.equal((xml.match(/xmi:type="uml:Association"/g) || []).length, 0, 'la relación no sale también suelta');
    assert.equal((xml.match(/<generalization /g) || []).length, 1, 'la herencia se mantiene');
    if (version === '2.1') {
      assert.match(xml, new RegExp(`<element xmi:idref="${inscripcion}" xmi:type="uml:AssociationClass"[^>]*>\\s*<model [^>]*/>\\s*<properties [^>]*sType="Class" nType="17"`));
      assert.match(xml, /<properties ea_type="Association" direction="Unspecified" subtype="Class"\/>/);
      assert.equal((xml.match(/subtype="Class"/g) || []).length, 1);
      // En el lienzo sigue la caja de la clase y la línea de la relación
      assert.match(xml, new RegExp(`<element geometry="Left=[^"]*" subject="${inscripcion}"`));
    }
  });
}

test('XMI sin clase de asociación: sale igual que antes', () => {
  const t = tableroBase();
  for (const version of ['2.5.1', '2.1']) {
    const xml = buildExportXML(t.nodes, t.edges, version, 'Academia');
    assert.doesNotMatch(xml, /AssociationClass|subtype="Class"|nType="17"/);
    assert.equal((xml.match(/xmi:type="uml:Association"/g) || []).length, 1);
  }
});
