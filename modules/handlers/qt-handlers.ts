/**
 * Qt/QML-specific handlers for analyzing C++ bindings and architecture layers
 * Handles Q_PROPERTY, Q_INVOKABLE, QML_ELEMENT, and three-layer architecture analysis
 */

import { promises as fs } from "fs";
import type { Entity } from "../../memory-types.js";
import { logger } from "../logger.js";
import type { IMemoryOperations } from "../memory-core.js";

// Temporary extended Entity type for Qt handlers until project analysis integration
interface EntityWithMetadata extends Entity {
  metadata?: {
    filePath?: string;
    imports?: string[];
  };
}

interface QProperty {
  name: string;
  type: string;
  className: string;
  filePath: string;
  lineNumber: number;
  readFunction?: string;
  writeFunction?: string;
  notifySignal?: string;
  qmlUsage: Array<{ file: string; line: number; usage: string }>;
}

interface QInvokable {
  name: string;
  signature: string;
  className: string;
  filePath: string;
  lineNumber: number;
  returnType?: string;
  parameters: string[];
  qmlCalls: Array<{ file: string; line: number; context: string }>;
}

interface QtController {
  className: string;
  namespace?: string;
  filePath: string;
  qmlRegistration: string; // QML_ELEMENT, qmlRegisterType, etc.
  propertyCount: number;
  invokableCount: number;
  signalCount: number;
}

interface LayerAnalysis {
  services: string[]; // Business logic classes
  controllers: string[]; // Classes with QML_ELEMENT
  uiComponents: string[]; // QML files
  relationships: Array<{
    from: string;
    to: string;
    type: "uses" | "exposes" | "connects";
  }>;
  violations: Array<{
    file: string;
    issue: string;
    severity: "warning" | "error";
  }>;
}

/**
 * Analyze QML bindings for a specific C++ class
 */
export async function analyzeQmlBindings(
  args: {
    class_name: string;
    include_usage?: boolean;
    branch_name?: string;
  },
  memoryCore: IMemoryOperations
): Promise<any> {
  const branchName = args.branch_name || "main";
  const className = args.class_name;
  const includeUsage = args.include_usage !== false;

  logger.info(`Analyzing QML bindings for class: ${className}`);

  // Get project files from memory
  const graph = await memoryCore.searchEntities(
    `${className} class`,
    branchName
  );
  const entities = graph.entities;

  // Find the C++ file containing this class
  const cppFiles = entities.filter(
    (e: EntityWithMetadata) =>
      e.entityType === "interface" &&
      (e.name === className || e.name.endsWith(`::${className}`))
  );

  if (cppFiles.length === 0) {
    return {
      error: `Class ${className} not found in project`,
      suggestion:
        "Make sure the project has been analyzed and the class name is correct",
    };
  }

  const classEntity = cppFiles[0];
  const filePath = (classEntity as EntityWithMetadata).metadata?.filePath;

  if (!filePath) {
    return {
      error: "Could not determine file path for class",
    };
  }

  // Parse the C++ file for Q_PROPERTY, Q_INVOKABLE, etc.
  const fileContent = await fs.readFile(filePath, "utf-8");
  const lines = fileContent.split("\n");

  const properties: QProperty[] = [];
  const invokables: QInvokable[] = [];
  const signals: string[] = [];
  let qmlRegistration: string | null = null;

  let inClass = false;
  let currentAccessModifier = "private";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for class definition
    if (
      line.includes(`class ${className}`) ||
      line.includes(`class ${className.split("::").pop()}`)
    ) {
      inClass = true;
    }

    if (!inClass) {
      // Check for QML registration macros
      if (line.includes("QML_ELEMENT") || line.includes("QML_NAMED_ELEMENT")) {
        qmlRegistration = line;
      }
      if (line.includes("qmlRegisterType") && line.includes(className)) {
        qmlRegistration = line;
      }
      continue;
    }

    // Track access modifiers
    if (line.startsWith("public:")) currentAccessModifier = "public";
    else if (line.startsWith("private:")) currentAccessModifier = "private";
    else if (line.startsWith("protected:")) currentAccessModifier = "protected";

    // Parse Q_PROPERTY
    if (line.includes("Q_PROPERTY")) {
      const property = parseQProperty(line, className, filePath, i + 1);
      if (property) {
        properties.push(property);
      }
    }

    // Parse Q_INVOKABLE
    if (line.includes("Q_INVOKABLE")) {
      const invokable = parseQInvokable(line, lines, i, className, filePath);
      if (invokable) {
        invokables.push(invokable);
      }
    }

    // Parse signals
    if (
      line.startsWith("signals:") ||
      (line.includes("signals:") && currentAccessModifier === "public")
    ) {
      // Read signal declarations
      for (let j = i + 1; j < lines.length; j++) {
        const sigLine = lines[j].trim();
        if (
          sigLine.startsWith("public:") ||
          sigLine.startsWith("private:") ||
          sigLine.startsWith("protected:")
        ) {
          break;
        }
        if (sigLine && !sigLine.startsWith("//") && sigLine.includes("(")) {
          signals.push(sigLine);
        }
      }
    }

    // End of class
    if (line === "};") {
      inClass = false;
    }
  }

  // If includeUsage is true, search QML files for usage
  if (includeUsage) {
    const qmlFiles = entities.filter((e: EntityWithMetadata) =>
      e.metadata?.filePath?.endsWith(".qml")
    );

    for (const property of properties) {
      property.qmlUsage = await findPropertyUsageInQml(
        property.name,
        className,
        qmlFiles
          .map((f: EntityWithMetadata) => f.metadata?.filePath)
          .filter(Boolean) as string[]
      );
    }

    for (const invokable of invokables) {
      invokable.qmlCalls = await findMethodCallsInQml(
        invokable.name,
        className,
        qmlFiles
          .map((f: EntityWithMetadata) => f.metadata?.filePath)
          .filter(Boolean) as string[]
      );
    }
  }

  return {
    className,
    filePath,
    qmlRegistration,
    properties: properties.map((p) => ({
      name: p.name,
      type: p.type,
      read: p.readFunction,
      write: p.writeFunction,
      notify: p.notifySignal,
      usageCount: p.qmlUsage.length,
      usages: includeUsage ? p.qmlUsage : undefined,
    })),
    invokables: invokables.map((inv) => ({
      name: inv.name,
      signature: inv.signature,
      returnType: inv.returnType,
      parameters: inv.parameters,
      callCount: inv.qmlCalls.length,
      calls: includeUsage ? inv.qmlCalls : undefined,
    })),
    signals: signals.map((s) => s.replace(/;$/, "")),
    summary: {
      propertyCount: properties.length,
      invokableCount: invokables.length,
      signalCount: signals.length,
      isQmlRegistered: !!qmlRegistration,
    },
  };
}

/**
 * Find all Qt controllers (classes registered with QML)
 */
export async function findQtControllers(
  args: {
    include_properties?: boolean;
    include_invokables?: boolean;
    namespace_filter?: string;
    branch_name?: string;
  },
  memoryCore: IMemoryOperations
): Promise<any> {
  const branchName = args.branch_name || "main";
  const includeProperties = args.include_properties !== false;
  const includeInvokables = args.include_invokables !== false;
  const namespaceFilter = args.namespace_filter;

  logger.info("Finding Qt controllers with QML registration");

  // Search for files with QML registration
  const graph = await memoryCore.searchEntities(
    "QML_ELEMENT qmlRegisterType class",
    branchName
  );
  const entities = graph.entities;

  const controllers: QtController[] = [];

  // Filter for C++ files
  const cppEntities = entities.filter(
    (e: EntityWithMetadata) =>
      e.entityType === "interface" &&
      e.metadata?.filePath &&
      /\.(cpp|hpp|h|hxx|cc|cxx)$/.test(e.metadata.filePath)
  );

  for (const entity of cppEntities) {
    const filePath = (entity as EntityWithMetadata).metadata?.filePath;
    if (!filePath) continue;

    try {
      const fileContent = await fs.readFile(filePath, "utf-8");
      const lines = fileContent.split("\n");

      // Check for QML registration
      const qmlRegistration = findQmlRegistration(lines, entity.name);
      if (!qmlRegistration) continue;

      // Apply namespace filter
      if (namespaceFilter && !entity.name.includes(namespaceFilter)) {
        continue;
      }

      const controller: QtController = {
        className: entity.name,
        namespace: entity.name.includes("::")
          ? entity.name.split("::").slice(0, -1).join("::")
          : undefined,
        filePath,
        qmlRegistration,
        propertyCount: 0,
        invokableCount: 0,
        signalCount: 0,
      };

      if (includeProperties || includeInvokables) {
        // Count properties and invokables
        for (const line of lines) {
          if (line.includes("Q_PROPERTY")) controller.propertyCount++;
          if (line.includes("Q_INVOKABLE")) controller.invokableCount++;
          if (line.trim().startsWith("signals:")) {
            // Count signals in the next few lines
            const signalsIndex = lines.indexOf(line);
            for (
              let i = signalsIndex + 1;
              i < Math.min(signalsIndex + 20, lines.length);
              i++
            ) {
              const sigLine = lines[i].trim();
              if (
                sigLine.startsWith("public:") ||
                sigLine.startsWith("private:") ||
                sigLine.startsWith("protected:")
              )
                break;
              if (
                sigLine &&
                sigLine.includes("(") &&
                !sigLine.startsWith("//")
              ) {
                controller.signalCount++;
              }
            }
          }
        }
      }

      controllers.push(controller);
    } catch (error) {
      logger.warn(`Failed to read file ${filePath}: ${error}`);
    }
  }

  return {
    totalControllers: controllers.length,
    controllers: controllers.map((c) => ({
      class: c.className,
      namespace: c.namespace,
      file: c.filePath,
      registration: c.qmlRegistration,
      ...(includeProperties && { properties: c.propertyCount }),
      ...(includeInvokables && { invokables: c.invokableCount }),
      signals: c.signalCount,
    })),
  };
}

/**
 * Analyze three-layer architecture (Service → Controller → UI)
 */
export async function analyzeLayerArchitecture(
  args: {
    layer_focus?: "service" | "controller" | "ui" | "all";
    show_violations?: boolean;
    branch_name?: string;
  },
  memoryCore: IMemoryOperations
): Promise<any> {
  const branchName = args.branch_name || "main";
  const layerFocus = args.layer_focus || "all";
  const showViolations = args.show_violations !== false;

  logger.info(`Analyzing layer architecture with focus: ${layerFocus}`);

  const analysis: LayerAnalysis = {
    services: [],
    controllers: [],
    uiComponents: [],
    relationships: [],
    violations: [],
  };

  // Get all entities
  const graph = await memoryCore.searchEntities("", branchName);
  const entities = graph.entities;

  // Categorize files into layers
  for (const entity of entities) {
    const filePath = (entity as EntityWithMetadata).metadata?.filePath;
    if (!filePath) continue;

    if (filePath.endsWith(".qml")) {
      // UI layer
      analysis.uiComponents.push(filePath);

      if (showViolations) {
        // Check for business logic in QML (violations)
        const violations = await checkQmlViolations(filePath);
        analysis.violations.push(...violations);
      }
    } else if (
      entity.entityType === "interface" &&
      /\.(cpp|hpp|h)$/.test(filePath)
    ) {
      // Check if it's a controller (has QML registration)
      try {
        const content = await fs.readFile(filePath, "utf-8");
        if (
          content.includes("QML_ELEMENT") ||
          content.includes("qmlRegisterType") ||
          content.includes("Q_PROPERTY") ||
          content.includes("Q_INVOKABLE")
        ) {
          analysis.controllers.push(entity.name);
        } else {
          // Service layer (business logic)
          analysis.services.push(entity.name);
        }
      } catch (error) {
        logger.warn(`Failed to read ${filePath}: ${error}`);
      }
    }
  }

  // Analyze relationships
  // Controllers should use Services, UI should use Controllers
  for (const controller of analysis.controllers) {
    const controllerEntity = entities.find(
      (e: EntityWithMetadata) => e.name === controller
    ) as EntityWithMetadata | undefined;
    if (controllerEntity?.metadata?.imports) {
      for (const imp of controllerEntity.metadata.imports) {
        if (analysis.services.includes(imp)) {
          analysis.relationships.push({
            from: controller,
            to: imp,
            type: "uses",
          });
        }
      }
    }
  }

  return {
    summary: {
      serviceCount: analysis.services.length,
      controllerCount: analysis.controllers.length,
      uiComponentCount: analysis.uiComponents.length,
      relationshipCount: analysis.relationships.length,
      violationCount: analysis.violations.length,
    },
    ...(layerFocus === "all" || layerFocus === "service"
      ? { services: analysis.services.slice(0, 50) }
      : {}),
    ...(layerFocus === "all" || layerFocus === "controller"
      ? { controllers: analysis.controllers.slice(0, 50) }
      : {}),
    ...(layerFocus === "all" || layerFocus === "ui"
      ? { uiComponents: analysis.uiComponents.slice(0, 50) }
      : {}),
    relationships: analysis.relationships.slice(0, 100),
    ...(showViolations ? { violations: analysis.violations } : {}),
  };
}

/**
 * Find QML files that use a specific controller
 */
export async function findQmlUsage(
  args: {
    controller_name: string;
    usage_type?: "property" | "method" | "signal" | "all";
    branch_name?: string;
  },
  memoryCore: IMemoryOperations
): Promise<any> {
  const branchName = args.branch_name || "main";
  const controllerName = args.controller_name;
  const usageType = args.usage_type || "all";

  logger.info(`Finding QML usage for controller: ${controllerName}`);

  // Get all QML files
  const graph = await memoryCore.searchEntities(".qml", branchName);
  const entities = graph.entities;

  const qmlFiles = entities.filter((e: EntityWithMetadata) =>
    e.metadata?.filePath?.endsWith(".qml")
  );

  const usages: Array<{
    file: string;
    usageType: string;
    line: number;
    code: string;
  }> = [];

  for (const qmlFile of qmlFiles) {
    const filePath = (qmlFile as EntityWithMetadata).metadata?.filePath;
    if (!filePath) continue;

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check for controller type declaration
        if (line.includes(controllerName) && line.includes("{")) {
          usages.push({
            file: filePath,
            usageType: "declaration",
            line: i + 1,
            code: line.trim(),
          });
        }

        // Check for property access
        if (
          (usageType === "property" || usageType === "all") &&
          line.includes(".")
        ) {
          // Simple pattern: objectName.propertyName
          const pattern = new RegExp(`\\w+\\.\\w+`, "g");
          if (pattern.test(line)) {
            usages.push({
              file: filePath,
              usageType: "property",
              line: i + 1,
              code: line.trim(),
            });
          }
        }

        // Check for method calls
        if (
          (usageType === "method" || usageType === "all") &&
          line.includes("(") &&
          line.includes(")")
        ) {
          usages.push({
            file: filePath,
            usageType: "method",
            line: i + 1,
            code: line.trim(),
          });
        }

        // Check for signal connections
        if (
          (usageType === "signal" || usageType === "all") &&
          (line.includes("onChanged") || line.includes("on"))
        ) {
          usages.push({
            file: filePath,
            usageType: "signal",
            line: i + 1,
            code: line.trim(),
          });
        }
      }
    } catch (error) {
      logger.warn(`Failed to read QML file ${filePath}: ${error}`);
    }
  }

  return {
    controller: controllerName,
    usageCount: usages.length,
    usages: usages.slice(0, 100), // Limit results
  };
}

/**
 * List all Q_PROPERTY declarations
 */
export async function listQProperties(
  args: {
    class_name?: string;
    property_type?: string;
    include_qml_usage?: boolean;
    branch_name?: string;
  },
  memoryCore: IMemoryOperations
): Promise<any> {
  const branchName = args.branch_name || "main";
  const className = args.class_name;
  const propertyType = args.property_type;
  const includeQmlUsage = args.include_qml_usage !== false;

  logger.info("Listing Q_PROPERTY declarations");

  const graph = await memoryCore.searchEntities(
    className || "Q_PROPERTY class",
    branchName
  );
  const entities = graph.entities;

  const properties: QProperty[] = [];

  // Filter C++ files
  const cppFiles = entities.filter(
    (e: EntityWithMetadata) =>
      e.metadata?.filePath &&
      /\.(cpp|hpp|h|hxx|cc|cxx)$/.test(e.metadata.filePath)
  );

  for (const entity of cppFiles) {
    if (
      className &&
      entity.name !== className &&
      !entity.name.endsWith(`::${className}`)
    ) {
      continue;
    }

    const filePath = (entity as EntityWithMetadata).metadata?.filePath;
    if (!filePath) continue;

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("Q_PROPERTY")) {
          const property = parseQProperty(line, entity.name, filePath, i + 1);
          if (property) {
            if (!propertyType || property.type === propertyType) {
              properties.push(property);
            }
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to read file ${filePath}: ${error}`);
    }
  }

  // Find QML usage if requested
  if (includeQmlUsage) {
    const qmlGraph = await memoryCore.searchEntities(".qml", branchName);
    const qmlFiles = qmlGraph.entities
      .filter((e: EntityWithMetadata) => e.metadata?.filePath?.endsWith(".qml"))
      .map((e: EntityWithMetadata) => e.metadata?.filePath)
      .filter(Boolean) as string[];

    for (const property of properties) {
      property.qmlUsage = await findPropertyUsageInQml(
        property.name,
        property.className,
        qmlFiles
      );
    }
  }

  return {
    totalProperties: properties.length,
    properties: properties.map((p) => ({
      name: p.name,
      type: p.type,
      class: p.className,
      file: p.filePath,
      line: p.lineNumber,
      read: p.readFunction,
      write: p.writeFunction,
      notify: p.notifySignal,
      ...(includeQmlUsage && {
        qmlUsageCount: p.qmlUsage.length,
        qmlUsages: p.qmlUsage.slice(0, 10),
      }),
    })),
  };
}

/**
 * List all Q_INVOKABLE methods
 */
export async function listQInvokables(
  args: {
    class_name?: string;
    include_qml_calls?: boolean;
    branch_name?: string;
  },
  memoryCore: IMemoryOperations
): Promise<any> {
  const branchName = args.branch_name || "main";
  const className = args.class_name;
  const includeQmlCalls = args.include_qml_calls !== false;

  logger.info("Listing Q_INVOKABLE methods");

  const graph = await memoryCore.searchEntities(
    className || "Q_INVOKABLE class",
    branchName
  );
  const entities = graph.entities;

  const invokables: QInvokable[] = [];

  // Filter C++ files
  const cppFiles = entities.filter(
    (e: EntityWithMetadata) =>
      e.metadata?.filePath &&
      /\.(cpp|hpp|h|hxx|cc|cxx)$/.test(e.metadata.filePath)
  );

  for (const entity of cppFiles) {
    if (
      className &&
      entity.name !== className &&
      !entity.name.endsWith(`::${className}`)
    ) {
      continue;
    }

    const filePath = (entity as EntityWithMetadata).metadata?.filePath;
    if (!filePath) continue;

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("Q_INVOKABLE")) {
          const invokable = parseQInvokable(
            line,
            lines,
            i,
            entity.name,
            filePath
          );
          if (invokable) {
            invokables.push(invokable);
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to read file ${filePath}: ${error}`);
    }
  }

  // Find QML calls if requested
  if (includeQmlCalls) {
    const qmlGraph = await memoryCore.searchEntities(".qml", branchName);
    const qmlFiles = qmlGraph.entities
      .filter((e: EntityWithMetadata) => e.metadata?.filePath?.endsWith(".qml"))
      .map((e: EntityWithMetadata) => e.metadata?.filePath)
      .filter(Boolean) as string[];

    for (const invokable of invokables) {
      invokable.qmlCalls = await findMethodCallsInQml(
        invokable.name,
        invokable.className,
        qmlFiles
      );
    }
  }

  return {
    totalInvokables: invokables.length,
    invokables: invokables.map((inv) => ({
      name: inv.name,
      signature: inv.signature,
      class: inv.className,
      file: inv.filePath,
      line: inv.lineNumber,
      returnType: inv.returnType,
      parameters: inv.parameters,
      ...(includeQmlCalls && {
        qmlCallCount: inv.qmlCalls.length,
        qmlCalls: inv.qmlCalls.slice(0, 10),
      }),
    })),
  };
}

// Helper functions

function parseQProperty(
  line: string,
  className: string,
  filePath: string,
  lineNumber: number
): QProperty | null {
  // Q_PROPERTY(type name READ getter WRITE setter NOTIFY signal)
  const match = line.match(/Q_PROPERTY\s*\(\s*(\w+(?:\s*\*)?)\s+(\w+)/);
  if (!match) return null;

  const type = match[1].trim();
  const name = match[2];

  const readMatch = line.match(/READ\s+(\w+)/);
  const writeMatch = line.match(/WRITE\s+(\w+)/);
  const notifyMatch = line.match(/NOTIFY\s+(\w+)/);

  return {
    name,
    type,
    className,
    filePath,
    lineNumber,
    readFunction: readMatch?.[1],
    writeFunction: writeMatch?.[1],
    notifySignal: notifyMatch?.[1],
    qmlUsage: [],
  };
}

function parseQInvokable(
  line: string,
  lines: string[],
  lineIndex: number,
  className: string,
  filePath: string
): QInvokable | null {
  // Q_INVOKABLE can be on the same line or the next line
  let methodLine = line.replace("Q_INVOKABLE", "").trim();
  if (!methodLine || methodLine === "") {
    methodLine = lines[lineIndex + 1]?.trim() || "";
  }

  // Parse method signature: returnType methodName(params)
  const match = methodLine.match(/(\w+(?:\s*\*)?)\s+(\w+)\s*\((.*?)\)/);
  if (!match) return null;

  const returnType = match[1].trim();
  const name = match[2];
  const paramsStr = match[3];

  const parameters: string[] = paramsStr
    ? paramsStr.split(",").map((p) => p.trim())
    : [];

  return {
    name,
    signature: methodLine,
    className,
    filePath,
    lineNumber: lineIndex + 1,
    returnType,
    parameters,
    qmlCalls: [],
  };
}

function findQmlRegistration(
  lines: string[],
  className: string
): string | null {
  for (const line of lines) {
    if (
      line.includes("QML_ELEMENT") ||
      line.includes("QML_NAMED_ELEMENT") ||
      (line.includes("qmlRegisterType") && line.includes(className))
    ) {
      return line.trim();
    }
  }
  return null;
}

async function findPropertyUsageInQml(
  propertyName: string,
  className: string,
  qmlFiles: string[]
): Promise<Array<{ file: string; line: number; usage: string }>> {
  const usages: Array<{ file: string; line: number; usage: string }> = [];

  for (const qmlFile of qmlFiles) {
    try {
      const content = await fs.readFile(qmlFile, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Look for property access patterns
        if (
          line.includes(propertyName) &&
          (line.includes(":") || line.includes("."))
        ) {
          usages.push({
            file: qmlFile,
            line: i + 1,
            usage: line.trim(),
          });
        }
      }
    } catch (error) {
      // Skip files that can't be read
    }
  }

  return usages;
}

async function findMethodCallsInQml(
  methodName: string,
  className: string,
  qmlFiles: string[]
): Promise<Array<{ file: string; line: number; context: string }>> {
  const calls: Array<{ file: string; line: number; context: string }> = [];

  for (const qmlFile of qmlFiles) {
    try {
      const content = await fs.readFile(qmlFile, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Look for method call patterns
        if (line.includes(methodName) && line.includes("(")) {
          calls.push({
            file: qmlFile,
            line: i + 1,
            context: line.trim(),
          });
        }
      }
    } catch (error) {
      // Skip files that can't be read
    }
  }

  return calls;
}

async function checkQmlViolations(
  qmlFile: string
): Promise<
  Array<{ file: string; issue: string; severity: "warning" | "error" }>
> {
  const violations: Array<{
    file: string;
    issue: string;
    severity: "warning" | "error";
  }> = [];

  try {
    const content = await fs.readFile(qmlFile, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check for business logic patterns in QML (violations)
      const functionIndex = line.indexOf("function ");
      if (functionIndex !== -1) {
        const commentIndex = line.indexOf("//");
        const isCommentedOut =
          commentIndex !== -1 && commentIndex < functionIndex;

        // Check if the 'function' keyword is inside a string literal
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let escaped = false;
        for (let j = 0; j < functionIndex; j++) {
          const ch = line[j];
          if (escaped) {
            escaped = false;
            continue;
          }
          if (ch === "\\") {
            escaped = true;
            continue;
          }
          if (ch === "'" && !inDoubleQuote) {
            inSingleQuote = !inSingleQuote;
          } else if (ch === '"' && !inSingleQuote) {
            inDoubleQuote = !inDoubleQuote;
          }
        }
        const inString = inSingleQuote || inDoubleQuote;

        if (!isCommentedOut && !inString) {
          // JavaScript functions in QML should be minimal
          violations.push({
            file: qmlFile,
            issue: `Line ${
              i + 1
            }: JavaScript function defined in QML. Consider moving logic to C++ controller.`,
            severity: "warning",
          });
        }
      }

      if (line.includes("XMLHttpRequest") || line.includes("fetch(")) {
        violations.push({
          file: qmlFile,
          issue: `Line ${
            i + 1
          }: Network request in QML. Should be handled in Service layer.`,
          severity: "error",
        });
      }

      if (
        line.includes("Qt.createComponent") ||
        line.includes("Qt.createQmlObject")
      ) {
        violations.push({
          file: qmlFile,
          issue: `Line ${
            i + 1
          }: Dynamic component creation. Consider declarative approach or move to Controller.`,
          severity: "warning",
        });
      }
    }
  } catch (error) {
    // Skip files that can't be read
  }

  return violations;
}
