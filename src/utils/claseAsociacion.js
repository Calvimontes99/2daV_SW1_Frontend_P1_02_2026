/**
 * Clases de asociación del tablero.
 *
 * En UML, una clase de asociación es una clase unida con una línea punteada a una
 * asociación entre otras dos clases: guarda los datos de cada enlace (p. ej. la nota de
 * una Inscripción entre Alumno y Curso). En el tablero se marca en tres lugares, y el
 * generador, los exportadores y la revisión de la IA aceptan cualquiera de ellos:
 *   - la clase:          data.isAssociationClass + data.associatedEdgeId (su relación)
 *   - la relación:       data.hasAssociationClass + data.associationClassNodeId (su clase)
 *   - la línea punteada: una arista con data.isAssociationConnection + data.parentRelationId,
 *     de la clase a un extremo de la relación. No se dibuja sola: la traza la relación,
 *     desde su punto medio hasta la clase (components/UmlEdge.jsx).
 *
 * Todas las funciones devuelven un tablero nuevo ({ nodes, edges }) sin tocar el recibido.
 */

import { tamanoNodo } from './distribucionImportada.js';

const TIPOS_ASOCIACION = new Set(['association', 'aggregation', 'composition']);
const ESTEREOTIPOS_NO_CLASE = new Set(['interface', 'enumeration']);

const tipoDe = (arista) => String(arista?.data?.type || arista?.data?.relation || 'Association').toLowerCase();

/** Una relación entre clases que puede tener clase de asociación (asociación, agregación o composición). */
export const admiteClaseAsociacion = (arista) =>
  !!arista &&
  !arista.data?.isAssociationConnection &&
  !arista.data?.isNoteConnection &&
  TIPOS_ASOCIACION.has(tipoDe(arista));

/** Id del nodo de la clase de asociación de una relación, o null. */
export const claseAsociacionDe = (arista) =>
  (arista?.data?.hasAssociationClass && (arista.data.associationClassNodeId || arista.data.associationClassId)) || null;

/** Id de la línea punteada de una relación: uno por relación. */
export const idLineaPunteada = (relacionId) => `assoc-edge-${relacionId}`;

/** Una clase (no nota, interfaz ni enumeración) que puede ser clase de asociación. */
export const puedeSerClaseAsociacion = (nodo) =>
  !!nodo && nodo.type === 'classNode' && !nodo.data?.isNote && !nodo.data?.isConnectionPoint &&
  !ESTEREOTIPOS_NO_CLASE.has(nodo.data?.stereotype);

const sinMarcasDeRelacion = (data = {}) => {
  const { hasAssociationClass, associationClassNodeId, associationClassId, ...resto } = data;
  return resto;
};
const sinMarcasDeClase = (data = {}) => {
  const { isAssociationClass, associatedEdgeId, ...resto } = data;
  return resto;
};

/**
 * Quita la clase de asociación de una relación: la clase queda como una clase común
 * (no se borra) y desaparece la línea punteada.
 */
export function desvincularClaseAsociacion({ nodes, edges }, relacionId) {
  const relacion = edges.find((e) => e.id === relacionId);
  const claseMarcada = claseAsociacionDe(relacion);
  return {
    nodes: nodes.map((n) => {
      const d = n.data || {};
      const suya = d.associatedEdgeId === relacionId || (!d.associatedEdgeId && n.id === claseMarcada);
      return d.isAssociationClass && suya ? { ...n, data: sinMarcasDeClase(d) } : n;
    }),
    edges: edges
      .filter((e) => !(e.data?.isAssociationConnection && e.data?.parentRelationId === relacionId))
      .map((e) => (e.id === relacionId && e.data?.hasAssociationClass ? { ...e, data: sinMarcasDeRelacion(e.data) } : e)),
  };
}

/**
 * Convierte una clase del tablero en la clase de asociación de una relación. Si la
 * relación tenía otra clase, esa vuelve a ser una clase común; si la clase era de otra
 * relación, deja de serlo.
 * @throws {Error} con un mensaje para mostrar si la combinación no es válida
 */
export function vincularClaseAsociacion(tablero, claseId, relacionId) {
  const relacion = tablero.edges.find((e) => e.id === relacionId);
  const clase = tablero.nodes.find((n) => n.id === claseId);
  if (!relacion || !admiteClaseAsociacion(relacion)) {
    throw new Error('La clase de asociación se une a una asociación entre dos clases.');
  }
  if (!puedeSerClaseAsociacion(clase)) {
    throw new Error('Solo una clase (no una nota, interfaz ni enumeración) puede ser clase de asociación.');
  }
  if (relacion.source === claseId || relacion.target === claseId) {
    throw new Error('La clase de asociación no puede ser uno de los extremos de su propia relación.');
  }

  let { nodes, edges } = desvincularClaseAsociacion(tablero, relacionId);
  const relacionAnterior = clase.data?.isAssociationClass && clase.data.associatedEdgeId;
  if (relacionAnterior && relacionAnterior !== relacionId) {
    ({ nodes, edges } = desvincularClaseAsociacion({ nodes, edges }, relacionAnterior));
  }

  return {
    nodes: nodes.map((n) =>
      n.id === claseId ? { ...n, data: { ...n.data, isAssociationClass: true, associatedEdgeId: relacionId } } : n
    ),
    edges: [
      ...edges.map((e) =>
        e.id === relacionId
          ? { ...e, data: { ...e.data, hasAssociationClass: true, associationClassNodeId: claseId, associationClassId: claseId } }
          : e
      ),
      {
        id: idLineaPunteada(relacionId),
        source: claseId,
        target: relacion.target,
        type: 'umlEdge',
        data: { type: 'AssociationClassConnection', isAssociationConnection: true, parentRelationId: relacionId, label: '' },
      },
    ],
  };
}

/** Caja de un nodo con su tamaño medido (o el estimado si todavía no se dibujó). */
const cajaDe = (nodo) => {
  const estimado = tamanoNodo(nodo.data);
  return {
    x: nodo.position?.x ?? 0,
    y: nodo.position?.y ?? 0,
    ancho: nodo.measured?.width ?? nodo.width ?? estimado.ancho,
    alto: nodo.measured?.height ?? nodo.height ?? estimado.alto,
  };
};

const seTocan = (a, b, margen) =>
  a.x < b.x + b.ancho + margen && b.x < a.x + a.ancho + margen &&
  a.y < b.y + b.alto + margen && b.y < a.y + a.alto + margen;

/**
 * Dónde poner una clase de asociación nueva: en el lugar libre más cercano al punto medio
 * de la relación, preferentemente hacia un costado de la línea (arriba o abajo si la
 * relación es horizontal) y sin tapar ese punto, de donde sale la línea punteada.
 */
export function posicionClaseAsociacion(nodes, relacion, data = {}) {
  const origen = nodes.find((n) => n.id === relacion.source);
  const destino = nodes.find((n) => n.id === relacion.target);
  const tamano = tamanoNodo(data);
  if (!origen || !destino) return { x: 100, y: 100 };

  const a = cajaDe(origen);
  const b = cajaDe(destino);
  const medio = { x: (a.x + a.ancho / 2 + b.x + b.ancho / 2) / 2, y: (a.y + a.alto / 2 + b.y + b.alto / 2) / 2 };
  const horizontal = Math.abs(b.x + b.ancho / 2 - (a.x + a.ancho / 2)) >= Math.abs(b.y + b.alto / 2 - (a.y + a.alto / 2));
  const otras = nodes.filter((n) => n.type === 'classNode' || n.type === 'noteNode').map(cajaDe);
  const tapaElMedio = (p) => seTocan({ ...p, ...tamano }, { x: medio.x, y: medio.y, ancho: 0, alto: 0 }, 50);

  // Anillos de puntos cada vez más lejos; moverse a lo largo de la línea cuesta el doble
  const PASO = 40;
  const costo = (i, j) => (horizontal ? 2 * Math.abs(i) + Math.abs(j) : Math.abs(i) + 2 * Math.abs(j));
  for (let anillo = 1; anillo <= 20; anillo++) {
    const candidatos = [];
    for (let i = -anillo; i <= anillo; i++) {
      for (let j = -anillo; j <= anillo; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) === anillo) candidatos.push({ i, j });
      }
    }
    candidatos.sort((p, q) => costo(p.i, p.j) - costo(q.i, q.j));
    const libre = candidatos
      .map(({ i, j }) => ({ x: medio.x - tamano.ancho / 2 + i * PASO, y: medio.y - tamano.alto / 2 + j * PASO }))
      .find((p) => !tapaElMedio(p) && !otras.some((c) => seTocan({ ...p, ...tamano }, c, 20)));
    if (libre) return { x: Math.round(libre.x), y: Math.round(libre.y) };
  }
  // Sin lugar libre cerca: debajo de la línea
  return horizontal
    ? { x: Math.round(medio.x - tamano.ancho / 2), y: Math.round(medio.y + 70) }
    : { x: Math.round(medio.x + 70), y: Math.round(medio.y - tamano.alto / 2) };
}

/** "ClaseAsociacion1", "ClaseAsociacion2"... el primero que no exista. */
const nombreDisponible = (nodes) => {
  const usados = new Set(nodes.map((n) => n.data?.className));
  let i = 1;
  while (usados.has(`ClaseAsociacion${i}`)) i += 1;
  return `ClaseAsociacion${i}`;
};

/**
 * Crea una clase de asociación nueva para la relación, junto a su punto medio.
 * @returns {{nodes, edges, nodo}} el tablero nuevo y la clase creada
 */
export function crearClaseAsociacion(tablero, relacionId, { id = `assoc-node-${Date.now()}`, nombre } = {}) {
  const relacion = tablero.edges.find((e) => e.id === relacionId);
  if (!relacion || !admiteClaseAsociacion(relacion)) {
    throw new Error('Elige una asociación entre dos clases (no una herencia, implementación o dependencia).');
  }
  const actual = claseAsociacionDe(relacion);
  if (actual && tablero.nodes.some((n) => n.id === actual)) {
    throw new Error('Esta relación ya tiene una clase de asociación.');
  }
  const data = { className: nombre || nombreDisponible(tablero.nodes), attributes: ['atributoAsociacion: string'], methods: [] };
  const nodo = { id, type: 'classNode', position: posicionClaseAsociacion(tablero.nodes, relacion, data), data };
  const resultado = vincularClaseAsociacion({ nodes: [...tablero.nodes, nodo], edges: tablero.edges }, id, relacionId);
  return { ...resultado, nodo: resultado.nodes.find((n) => n.id === id) };
}

/**
 * Quita las marcas que quedaron sueltas al borrar la clase o la relación, al cambiar el
 * tipo de la relación o al deshacer: una relación que apunta a una clase que ya no está,
 * una clase cuya relación se borró y líneas punteadas sin relación o sin clase. Nunca
 * agrega nada. Devuelve el mismo objeto si no había nada que corregir.
 */
export function normalizarClasesAsociacion(tablero) {
  const { nodes, edges } = tablero;
  const hayMarcas =
    nodes.some((n) => n.data?.isAssociationClass) ||
    edges.some((e) => e.data?.hasAssociationClass || e.data?.isAssociationConnection);
  if (!hayMarcas) return tablero;

  const nodosPorId = new Map(nodes.map((n) => [n.id, n]));
  const aristasPorId = new Map(edges.map((e) => [e.id, e]));
  // El par relación-clase vale si ambas existen, la clase no es un extremo y ninguna de las
  // dos apunta a otra: si la relación nombra su clase, esa manda
  const parValido = (relacionId, claseId) => {
    const relacion = aristasPorId.get(relacionId);
    const clase = nodosPorId.get(claseId);
    if (!relacion || !admiteClaseAsociacion(relacion) || !puedeSerClaseAsociacion(clase)) return false;
    if (relacion.source === claseId || relacion.target === claseId) return false;
    const marcada = claseAsociacionDe(relacion);
    if (marcada && marcada !== claseId) return false;
    const otra = clase.data?.isAssociationClass && clase.data.associatedEdgeId;
    return !otra || otra === relacionId;
  };

  let cambio = false;
  const nuevasAristas = [];
  for (const e of edges) {
    const d = e.data || {};
    if (d.isAssociationConnection) {
      if (parValido(d.parentRelationId, e.source)) nuevasAristas.push(e);
      else cambio = true;
    } else if (d.hasAssociationClass && !parValido(e.id, claseAsociacionDe(e))) {
      cambio = true;
      nuevasAristas.push({ ...e, data: sinMarcasDeRelacion(d) });
    } else {
      nuevasAristas.push(e);
    }
  }
  const nuevosNodos = nodes.map((n) => {
    const d = n.data || {};
    if (!d.isAssociationClass || parValido(d.associatedEdgeId, n.id)) return n;
    cambio = true;
    return { ...n, data: sinMarcasDeClase(d) };
  });
  return cambio ? { nodes: nuevosNodos, edges: nuevasAristas } : tablero;
}

/**
 * Relación -> su clase de asociación, con cualquiera de las tres marcas (como el generador del
 * backend, libs/clasesAsociacion.js): sirve para exportar también tableros de versiones anteriores.
 * Solo pares cuya relación existe y cuya clase existe y no es uno de sus extremos.
 * @returns {Map<string, string>} id de la relación -> id del nodo de la clase
 */
export function paresClaseAsociacion(nodes, edges) {
  const pares = new Map();
  const poner = (relacionId, claseId) => {
    if (relacionId && claseId && !pares.has(relacionId)) pares.set(relacionId, claseId);
  };
  (edges || []).forEach((e) => { if (e.data?.hasAssociationClass) poner(e.id, claseAsociacionDe(e)); });
  (nodes || []).forEach((n) => { if (n.data?.isAssociationClass) poner(n.data.associatedEdgeId, n.id); });
  (edges || []).forEach((e) => { if (e.data?.isAssociationConnection) poner(e.data.parentRelationId, e.source); });
  const nodos = new Set((nodes || []).map((n) => n.id));
  const aristas = new Map((edges || []).map((e) => [e.id, e]));
  for (const [relacionId, claseId] of [...pares]) {
    const relacion = aristas.get(relacionId);
    if (!relacion || !nodos.has(claseId) || relacion.source === claseId || relacion.target === claseId) pares.delete(relacionId);
  }
  return pares;
}

/** Nombre legible de una relación para listas: "Alumno — Curso (inscribe)". */
export const describirRelacion = (nodes, arista) => {
  const nombre = (id) => nodes.find((n) => n.id === id)?.data?.className || '?';
  const etiqueta = arista.data?.label ? ` (${arista.data.label})` : '';
  return `${nombre(arista.source)} — ${nombre(arista.target)}${etiqueta}`;
};

/** Relaciones a las que una clase puede unirse como clase de asociación. */
export const relacionesParaClase = (nodes, edges, claseId) =>
  edges
    .filter((e) => admiteClaseAsociacion(e) && e.source !== claseId && e.target !== claseId)
    .filter((e) => {
      const actual = claseAsociacionDe(e);
      return !actual || actual === claseId || !nodes.some((n) => n.id === actual);
    })
    .map((e) => ({ id: e.id, etiqueta: describirRelacion(nodes, e) }));
