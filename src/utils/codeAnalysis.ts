import { PYGAME_IMPORT_REGEX } from '../constants'
import type {
  StructureModel,
  FunctionDef,
  ClassDef,
  StructureItem,
  DiagramModel,
  ClassRecord,
  CompositionEdge,
  HierarchyModel,
  OutlineModel,
  OutlineNode,
  OutlineNodeKind,
} from '../types'

export const cleanCodeText = (text: string): string =>
  (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/ /g, ' ')

export const codeUsesPygame = (source: string): boolean =>
  PYGAME_IMPORT_REGEX.test(cleanCodeText(source))

// ── Structure model ────────────────────────────────────────────────────────

export const buildPythonStructureModel = (source: string): StructureModel => {
  const lines = cleanCodeText(source).split('\n')
  const items: StructureItem[] = []
  const definitionByKey: Record<string, FunctionDef> = {}
  const contextStack: Array<{ type: string; indent: number; item: ClassDef | FunctionDef }> = []

  lines.forEach((rawLine, index) => {
    const expandedLine = rawLine.replace(/\t/g, '    ')
    const trimmedLine = expandedLine.trim()
    if (!trimmedLine || trimmedLine.startsWith('#')) return

    const indent = expandedLine.length - expandedLine.trimStart().length

    while (contextStack.length > 0 && indent <= contextStack[contextStack.length - 1].indent) {
      contextStack.pop()
    }

    const classMatch = trimmedLine.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)(?:\(([^)]*)\))?\s*:/)
    if (classMatch) {
      const classItem: ClassDef = {
        type: 'class',
        name: classMatch[1],
        interface: trimmedLine,
        line: index + 1,
        indent,
        methods: [],
      }
      items.push(classItem)
      contextStack.push({ type: 'class', indent, item: classItem })
      return
    }

    const defMatch = trimmedLine.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/)
    if (!defMatch) return

    const classContext = [...contextStack].reverse().find(entry => entry.type === 'class')
    const className = classContext && indent > classContext.indent ? (classContext.item as ClassDef).name : ''
    const definition: FunctionDef = {
      type: 'def',
      name: defMatch[1],
      className,
      key: className ? `${className}.${defMatch[1]}` : defMatch[1],
      interface: trimmedLine,
      line: index + 1,
      indent,
    }
    definitionByKey[definition.key] = definition

    if (className && classContext) {
      ;(classContext.item as ClassDef).methods.push(definition)
    } else {
      items.push(definition)
    }

    contextStack.push({ type: 'def', indent, item: definition })
  })

  return {
    items,
    definitionByKey,
    orderedDefinitions: Object.values(definitionByKey).sort((a, b) => a.line - b.line),
  }
}

// ── Diagram analysis ───────────────────────────────────────────────────────

const sanitizeDiagramIdentifier = (value: string): string =>
  (value || '')
    .trim()
    .split('.')
    .pop()!
    .replace(/[^A-Za-z0-9_]/g, '')

const parseBaseList = (value: string): string[] =>
  (value || '')
    .split(',')
    .map(part => sanitizeDiagramIdentifier(part))
    .filter(Boolean)

const extractConstructorNames = (expression: string): string[] => {
  const matches: string[] = []
  const regex = /(^|[^.\w])([A-Z][A-Za-z0-9_]*)\s*\(/g
  let match = regex.exec(expression)
  while (match) {
    matches.push(match[2])
    match = regex.exec(expression)
  }
  return matches
}

const getLineagePath = (className: string, classByName: Record<string, ClassRecord>): string[] => {
  const lineage: string[] = []
  const visited = new Set<string>()
  let current: string | null = className
  while (current && !visited.has(current) && classByName[current]) {
    lineage.push(current)
    visited.add(current)
    current = classByName[current].primaryBase
  }
  return lineage
}

const getMostSpecificCommonAncestor = (targets: string[], classByName: Record<string, ClassRecord>): string => {
  if (targets.length === 0) return ''
  const firstLineage = getLineagePath(targets[0], classByName)
  return firstLineage.find(candidate => targets.every(target => getLineagePath(target, classByName).includes(candidate))) || targets[0]
}

export const analyzePythonClasses = (source: string): DiagramModel => {
  const lines = cleanCodeText(source).split('\n')
  const classByName: Record<string, ClassRecord> = {}
  const orderedNames: string[] = []
  const contextStack: Array<{ type: string; name: string; indent: number }> = []

  const ensureClass = (name: string, line: number): ClassRecord => {
    if (!classByName[name]) {
      classByName[name] = { name, line, bases: [], primaryBase: null, attributeTargets: {}, compositionTargets: [] }
      orderedNames.push(name)
    }
    return classByName[name]
  }

  const addAttributeTarget = (record: ClassRecord, attrName: string, targetName: string) => {
    if (!attrName || !targetName) return
    if (!record.attributeTargets[attrName]) record.attributeTargets[attrName] = new Set()
    record.attributeTargets[attrName].add(targetName)
  }

  lines.forEach((rawLine, index) => {
    const expandedLine = rawLine.replace(/\t/g, '    ')
    const trimmedLine = expandedLine.trim()
    if (!trimmedLine || trimmedLine.startsWith('#')) return

    const indent = expandedLine.length - expandedLine.trimStart().length

    while (contextStack.length > 0 && indent <= contextStack[contextStack.length - 1].indent) {
      contextStack.pop()
    }

    const classMatch = trimmedLine.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)(?:\(([^)]*)\))?\s*:/)
    if (classMatch) {
      const record = ensureClass(classMatch[1], index + 1)
      record.bases = parseBaseList(classMatch[2] || '')
      contextStack.push({ type: 'class', name: classMatch[1], indent })
      return
    }

    const defMatch = trimmedLine.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/)
    if (defMatch) {
      contextStack.push({ type: 'def', name: defMatch[1], indent })
      return
    }

    const currentClassContext = [...contextStack].reverse().find(entry => entry.type === 'class')
    if (!currentClassContext) return

    const currentClass = ensureClass(currentClassContext.name, index + 1)
    const directAssignment = trimmedLine.match(/^self\.(\w+)\s*=\s*([A-Z][A-Za-z0-9_]*)\s*\(/)
    if (directAssignment) addAttributeTarget(currentClass, directAssignment[1], directAssignment[2])

    const appendRegex = /self\.(\w+)\.(?:append|add)\(\s*([A-Z][A-Za-z0-9_]*)\s*\(/g
    let appendMatch = appendRegex.exec(trimmedLine)
    while (appendMatch) {
      addAttributeTarget(currentClass, appendMatch[1], appendMatch[2])
      appendMatch = appendRegex.exec(trimmedLine)
    }

    const listAssignment = trimmedLine.match(/^self\.(\w+)\s*=\s*\[(.*)\]\s*$/)
    if (listAssignment) {
      extractConstructorNames(listAssignment[2]).forEach(n => addAttributeTarget(currentClass, listAssignment[1], n))
    }

    const extendMatch = trimmedLine.match(/^self\.(\w+)\.extend\((.*)\)\s*$/)
    if (extendMatch) {
      extractConstructorNames(extendMatch[2]).forEach(n => addAttributeTarget(currentClass, extendMatch[1], n))
    }
  })

  const classNames = new Set(orderedNames)
  const childMap: Record<string, string[]> = {}
  orderedNames.forEach(name => { childMap[name] = [] })

  orderedNames.forEach(name => {
    const record = classByName[name]
    record.primaryBase = record.bases.find(b => classNames.has(b)) || null
    if (record.primaryBase) childMap[record.primaryBase].push(name)
  })

  orderedNames.forEach(name => {
    const record = classByName[name]
    const compositionTargets: CompositionEdge[] = Object.entries(record.attributeTargets)
      .map(([attrName, targetSet]) => {
        const internalTargets = [...targetSet].filter(t => classNames.has(t))
        if (internalTargets.length === 0) return null
        return {
          attr: attrName,
          target: internalTargets.length === 1 ? internalTargets[0] : getMostSpecificCommonAncestor(internalTargets, classByName),
          rawTargets: internalTargets,
        }
      })
      .filter((e): e is CompositionEdge => e !== null)
      .filter((edge, i, all) => all.findIndex(c => c.target === edge.target) === i)
    record.compositionTargets = compositionTargets
  })

  return {
    classes: orderedNames.map(n => classByName[n]),
    classByName,
    childMap,
    inheritanceRoots: orderedNames.filter(n => !classByName[n].primaryBase),
    compositionGroups: orderedNames
      .map(n => ({ owner: n, edges: classByName[n].compositionTargets }))
      .filter(g => g.edges.length > 0),
    lineages: Object.fromEntries(orderedNames.map(n => [n, getLineagePath(n, classByName)])),
  }
}

export const isClassActiveInDiagram = (diagramModel: DiagramModel, currentClass: string, classId: string): boolean =>
  !!currentClass && (diagramModel?.lineages?.[currentClass] || []).includes(classId)

// ── Hierarchy analysis ─────────────────────────────────────────────────────

export const analyzePythonFunctions = (source: string): HierarchyModel => {
  const lines = cleanCodeText(source).split('\n')
  const functionDefs: Record<string, { name: string; line: number; calls: string[] }> = {}
  const orderedNames: string[] = []
  const defStack: Array<{ name: string; indent: number }> = []

  lines.forEach((rawLine, index) => {
    const expandedLine = rawLine.replace(/\t/g, '    ')
    const trimmedLine = expandedLine.trim()
    if (!trimmedLine || trimmedLine.startsWith('#')) return

    const indent = expandedLine.length - expandedLine.trimStart().length
    while (defStack.length > 0 && indent <= defStack[defStack.length - 1].indent) defStack.pop()

    const defMatch = trimmedLine.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/)
    if (defMatch) {
      const name = defMatch[1]
      if (!functionDefs[name]) {
        functionDefs[name] = { name, line: index + 1, calls: [] }
        orderedNames.push(name)
      }
      defStack.push({ name, indent })
      return
    }

    if (defStack.length > 0) {
      const currentFuncName = defStack[defStack.length - 1].name
      const callRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
      let match
      while ((match = callRegex.exec(trimmedLine)) !== null) {
        const calledName = match[1]
        if (calledName !== currentFuncName && !functionDefs[currentFuncName].calls.includes(calledName)) {
          functionDefs[currentFuncName].calls.push(calledName)
        }
      }
    }
  })

  const funcNames = new Set(orderedNames)
  orderedNames.forEach(name => {
    functionDefs[name].calls = functionDefs[name].calls.filter(c => funcNames.has(c))
  })

  const calledFunctions = new Set<string>()
  orderedNames.forEach(name => functionDefs[name].calls.forEach(c => calledFunctions.add(c)))
  const roots = orderedNames.filter(name => !calledFunctions.has(name))

  return { functionDefs, orderedNames, roots }
}

// ── Outline analysis ───────────────────────────────────────────────────────

const makeOutlineNode = (kind: OutlineNodeKind, name: string, line: number, extra: Partial<OutlineNode> = {}): OutlineNode => ({
  id: `${kind}:${name}:${line}:${extra.owner || ''}`,
  kind,
  name,
  line,
  children: [],
  ...extra,
})

const parsePythonParameters = (signaturePart: string): string[] =>
  (signaturePart || '')
    .split(',')
    .map(part => part.replace(/=.*/, '').replace(/:.*/, '').replace(/^[*]+/, '').trim())
    .filter(name => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))

const addUniqueOutlineChild = (parent: OutlineNode, child: OutlineNode): void => {
  if (!parent.children.some(n => n.kind === child.kind && n.name === child.name)) {
    parent.children.push(child)
  }
}

export const analyzePythonOutline = (source: string): OutlineModel => {
  const lines = cleanCodeText(source).split('\n')
  const roots: OutlineNode[] = []
  const stack: Array<{ type: string; indent: number; node: OutlineNode | null }> = []

  const nearestScope = (kind: string) => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].type === kind) return stack[i]
    }
    return null
  }

  const appendToCurrentContainer = (node: OutlineNode) => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].node) { stack[i].node!.children.push(node); return }
    }
    roots.push(node)
  }

  lines.forEach((rawLine, index) => {
    const expandedLine = rawLine.replace(/\t/g, '    ')
    const trimmedLine = expandedLine.trim()
    if (!trimmedLine || trimmedLine.startsWith('#')) return

    const line = index + 1
    const indent = expandedLine.length - expandedLine.trimStart().length

    while (stack.length > 0 && indent <= stack[stack.length - 1].indent) stack.pop()

    const classMatch = trimmedLine.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)\b/)
    if (classMatch) {
      const classNode = makeOutlineNode('class', classMatch[1], line)
      appendToCurrentContainer(classNode)
      stack.push({ type: 'class', indent, node: classNode })
      return
    }

    const defMatch = trimmedLine.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/)
    if (defMatch) {
      const ownerClass = nearestScope('class')?.node || null
      const defNode = makeOutlineNode(ownerClass ? 'method' : 'function', defMatch[1], line, { owner: ownerClass?.name || '' })
      parsePythonParameters(defMatch[2]).forEach(paramName => {
        if (paramName === 'self') return
        addUniqueOutlineChild(defNode, makeOutlineNode('parameter', paramName, line, { owner: defNode.name }))
      })
      appendToCurrentContainer(defNode)
      stack.push({ type: 'function', indent, node: defNode })
      return
    }

    const currentFunction = nearestScope('function')?.node || null
    const currentClass = nearestScope('class')?.node || null

    const selfAttrMatch = trimmedLine.match(/^self\.([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=/)
    if (selfAttrMatch && currentClass) {
      addUniqueOutlineChild(currentClass, makeOutlineNode('attribute', selfAttrMatch[1], line, { owner: currentClass.name }))
      return
    }

    const assignmentMatch = trimmedLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=/)
    if (assignmentMatch) {
      const name = assignmentMatch[1]
      if (currentFunction) {
        addUniqueOutlineChild(currentFunction, makeOutlineNode('local', name, line, { owner: currentFunction.name }))
      } else if (currentClass) {
        addUniqueOutlineChild(currentClass, makeOutlineNode('attribute', name, line, { owner: currentClass.name }))
      } else {
        roots.push(makeOutlineNode(name === name.toUpperCase() ? 'constant' : 'global', name, line))
      }
    }
  })

  return { roots, lines: lines.length }
}

export const walkOutlineNodes = (nodes: OutlineNode[], callback: (node: OutlineNode) => void): void => {
  nodes.forEach(node => {
    callback(node)
    if (node.children?.length) walkOutlineNodes(node.children, callback)
  })
}

export const getExpandableOutlineIds = (outlineModel: OutlineModel): string[] => {
  const ids: string[] = []
  walkOutlineNodes(outlineModel?.roots || [], node => {
    if (node.children?.length) ids.push(node.id)
  })
  return ids
}

export const countOutlineNodes = (outlineModel: OutlineModel): number => {
  let count = 0
  walkOutlineNodes(outlineModel?.roots || [], () => { count++ })
  return count
}
