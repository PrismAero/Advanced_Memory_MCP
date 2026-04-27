import { promises as fs } from "fs";
import { logger } from "../logger.js";
import {
  CodeSemanticType,
  ProjectEmbeddingEngine,
} from "../ml/project-embedding-engine.js";
import {
  CodeInterfaceRecord,
  ProjectAnalysisOperations,
  ProjectFileRecord,
} from "../sqlite/project-analysis-operations.js";
import { InterfaceExtractorRunner } from "./interfaces/interface-extractor-runner.js";

/**
 * Interface analysis result
 */
export interface InterfaceAnalysisResult {
  interface: EnhancedInterfaceInfo;
  implementations: InterfaceImplementation[];
  usages: InterfaceUsage[];
  related_interfaces: RelatedInterface[];
  data_flow: DataFlowMapping[];
  api_endpoints?: APIEndpointInfo[];
}

/**
 * Enhanced interface information
 */
export interface EnhancedInterfaceInfo {
  id?: number;
  name: string;
  file_path: string;
  relative_path: string;
  line_number: number;
  definition: string;
  properties: InterfaceProperty[];
  extends_interfaces: string[];
  generic_parameters?: string[];
  is_exported: boolean;
  is_api_contract: boolean;
  is_props_interface: boolean;
  is_state_interface: boolean;
  complexity_score: number;
  usage_frequency: number;
  semantic_type: CodeSemanticType;
  documentation?: string;
  examples?: string[];
}

/**
 * Interface property details
 */
export interface InterfaceProperty {
  name: string;
  type: string;
  is_optional: boolean;
  is_readonly: boolean;
  is_method: boolean;
  description?: string;
  default_value?: string;
  constraints?: string[];
}

/**
 * Interface implementation details
 */
export interface InterfaceImplementation {
  implementing_entity: string; // Class, component, or service name
  file_path: string;
  line_number: number;
  implementation_type: "class" | "function" | "component" | "service";
  completeness: number; // 0-1 score of how completely it implements the interface
  missing_properties: string[];
  additional_properties: string[];
  confidence: number;
}

/**
 * Interface usage pattern
 */
export interface InterfaceUsage {
  usage_location: string;
  file_path: string;
  line_number: number;
  usage_type: "parameter" | "return_type" | "property" | "generic" | "extends";
  context: string;
  frequency: number;
}

/**
 * Related interface information
 */
export interface RelatedInterface {
  interface: EnhancedInterfaceInfo;
  relationship_type:
    | "extends"
    | "contains"
    | "similar"
    | "composed_of"
    | "uses";
  similarity_score: number;
  shared_properties: string[];
  reasoning: string;
}

/**
 * Data flow mapping between interfaces
 */
export interface DataFlowMapping {
  source_interface: string;
  target_interface: string;
  flow_type: "input" | "output" | "transformation" | "aggregation";
  transformation_logic?: string;
  components_involved: string[];
  confidence: number;
}

/**
 * API endpoint information derived from interfaces
 */
export interface APIEndpointInfo {
  endpoint_path: string;
  method: string;
  request_interface?: string;
  response_interface?: string;
  error_interfaces?: string[];
  middleware_interfaces?: string[];
}

/**
 * Interface relationship graph
 */
export interface InterfaceRelationshipGraph {
  nodes: Array<{
    interface: EnhancedInterfaceInfo;
    centrality: number; // How central this interface is in the project
    cluster_id?: string;
  }>;
  edges: Array<{
    from: string;
    to: string;
    relationship_type: string;
    weight: number;
    properties: { [key: string]: any };
  }>;
  clusters: Array<{
    id: string;
    name: string;
    interfaces: string[];
    domain: string; // e.g., "authentication", "data-layer", "ui-components"
  }>;
}

/**
 * Interface Mapper
 * Intelligent detection and mapping of interfaces, their relationships, and usage patterns
 */
export class InterfaceMapper {
  private projectAnalysisOps: ProjectAnalysisOperations;
  private embeddingEngine: ProjectEmbeddingEngine;
  private extractorRunner = new InterfaceExtractorRunner();
  private interfaceCache = new Map<string, EnhancedInterfaceInfo>();
  private relationshipCache = new Map<string, RelatedInterface[]>();

  // TypeScript/JavaScript patterns
  private readonly INTERFACE_PATTERNS = {
    interface_declaration:
      /interface\s+(\w+)(?:<[^>]*>)?\s*(?:extends\s+([^{]+))?\s*\{([^}]*)\}/gs,
    type_alias: /type\s+(\w+)(?:<[^>]*>)?\s*=\s*([^;]+);?/gs,
    props_interface: /interface\s+(\w+)(?:Props|Properties)\s*\{([^}]*)\}/gs,
    api_interface:
      /interface\s+(\w+)(?:Request|Response|API|Endpoint)\s*\{([^}]*)\}/gs,
    class_implements:
      /class\s+(\w+)(?:<[^>]*>)?(?:\s+extends\s+[^{]+)?\s+implements\s+([^{]+)\s*\{/gs,
    property_declaration: /(\w+)(\?)?:\s*([^;,\n]+)/gs,
    method_declaration: /(\w+)(\?)?(\([^)]*\)):\s*([^;,\n}]+)/gs,
    generic_parameters: /<([^>]+)>/g,
  };

  constructor(
    projectAnalysisOps: ProjectAnalysisOperations,
    embeddingEngine: ProjectEmbeddingEngine,
  ) {
    this.projectAnalysisOps = projectAnalysisOps;
    this.embeddingEngine = embeddingEngine;

    logger.debug("[SEARCH] Interface mapper initialized");
  }

  /**
   * Analyze all interfaces in project files
   */
  async analyzeProjectInterfaces(
    branchName?: string,
  ): Promise<InterfaceAnalysisResult[]> {
    logger.info("[SEARCH] Starting comprehensive interface analysis");

    // Get all source files. Language-specific extraction is delegated to
    // InterfaceExtractorRunner so C/C++/Python/TS/JS can share the same pipeline.
    const sourceFiles = await this.projectAnalysisOps.getProjectFiles({
      branchName,
      category: "source",
    });
    const analysisResults: InterfaceAnalysisResult[] = [];

    logger.info(`[FOLDER] Analyzing interfaces in ${sourceFiles.length} files`);

    for (const file of sourceFiles) {
      try {
        const fileAnalysis = await this.analyzeFileInterfaces(file);
        analysisResults.push(...fileAnalysis);
      } catch (error) {
        logger.warn(
          `Failed to analyze interfaces in ${file.relative_path}:`,
          error,
        );
      }
    }

    // Build relationship graph
    await this.buildInterfaceRelationshipGraph(analysisResults);

    logger.info(
      `[SUCCESS] Interface analysis complete: found ${analysisResults.length} interface contexts`,
    );
    return analysisResults;
  }

  /**
   * Analyze interfaces in a specific file
   */
  async analyzeFileInterfaces(
    fileRecord: ProjectFileRecord,
  ): Promise<InterfaceAnalysisResult[]> {
    try {
      // Read file content
      const content = await fs.readFile(fileRecord.file_path, "utf-8");

      const extraction = await this.extractorRunner.extract(content, {
        language: fileRecord.language,
        filePath: fileRecord.file_path,
        relativePath: fileRecord.relative_path,
      });
      const interfaces: EnhancedInterfaceInfo[] = extraction.interfaces.map(
        (iface) => {
          const semanticType: CodeSemanticType =
            iface.kind === "function" || iface.kind === "method"
              ? "function_signature"
              : iface.kind === "class" || iface.kind === "struct"
                ? "class_definition"
                : "interface_definition";
          return {
            id: undefined,
            name: iface.name,
            file_path: fileRecord.file_path,
            relative_path: fileRecord.relative_path,
            line_number: iface.startLine || iface.line,
            definition: iface.definition || iface.signature || iface.name,
            properties: (iface.members || []).map((member) => ({
              name: member.name,
              type: member.type || member.signature || "",
              is_optional: Boolean(member.isOptional),
              is_readonly: Boolean(member.isReadonly),
              is_method: member.kind === "method",
            })),
            extends_interfaces: iface.extends || [],
            generic_parameters: iface.templateParameters,
            is_exported: iface.isExported,
            is_api_contract:
              iface.kind === "interface" &&
              /api|request|response/i.test(iface.name),
            is_props_interface: /props$/i.test(iface.name),
            is_state_interface: /state$/i.test(iface.name),
            complexity_score: Math.min(1, (iface.members?.length || 0) / 50),
            usage_frequency: 0,
            semantic_type: semanticType,
            documentation: iface.documentation,
          };
        },
      );

      const results: InterfaceAnalysisResult[] = [];

      for (const iface of interfaces) {
        // Store interface in database
        const stored = await this.storeInterfaceInDatabase(iface, fileRecord);
        if (!stored) continue;

        // Analyze implementations
        const implementations = await this.findInterfaceImplementations(
          iface,
          content,
          fileRecord,
        );

        // Analyze usages (for now, only analyze the current file)
        const usages = await this.findInterfaceUsages(iface, [fileRecord]);

        // Find related interfaces
        const relatedInterfaces = await this.findRelatedInterfaces(iface);

        // Map data flow
        const dataFlow = await this.mapDataFlow(iface, content);

        // Detect API endpoints
        const apiEndpoints = await this.detectAPIEndpoints(iface, content);

        results.push({
          interface: iface,
          implementations,
          usages,
          related_interfaces: relatedInterfaces,
          data_flow: dataFlow,
          api_endpoints: apiEndpoints,
        });
      }

      return results;
    } catch (error) {
      logger.error(
        `Failed to analyze file interfaces for ${fileRecord.file_path}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Parse interfaces from TypeScript/JavaScript content
   */
  private async parseInterfacesFromContent(
    content: string,
    filePath: string,
    relativePath: string,
  ): Promise<EnhancedInterfaceInfo[]> {
    const interfaces: EnhancedInterfaceInfo[] = [];
    const lines = content.split("\n");

    // Parse interface declarations
    let match;
    this.INTERFACE_PATTERNS.interface_declaration.lastIndex = 0;

    while (
      (match = this.INTERFACE_PATTERNS.interface_declaration.exec(content)) !==
      null
    ) {
      const [fullMatch, name, extendsClause, body] = match;
      const lineNumber = this.getLineNumber(content, match.index);

      const properties = this.parseInterfaceProperties(body);
      const extendsInterfaces = extendsClause
        ? extendsClause
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      const enhancedInterface: EnhancedInterfaceInfo = {
        name,
        file_path: filePath,
        relative_path: relativePath,
        line_number: lineNumber,
        definition: fullMatch,
        properties,
        extends_interfaces: extendsInterfaces,
        generic_parameters: this.extractGenericParameters(fullMatch),
        is_exported: this.isExported(content, match.index),
        is_api_contract: this.isAPIContract(name, properties),
        is_props_interface: this.isPropsInterface(name, properties),
        is_state_interface: this.isStateInterface(name, properties),
        complexity_score: this.calculateComplexityScore(properties),
        usage_frequency: 0, // Will be updated later
        semantic_type: this.determineSemanticType(name, properties, body),
        documentation: this.extractDocumentation(lines, lineNumber - 1),
      };

      interfaces.push(enhancedInterface);

      // Cache the interface
      this.interfaceCache.set(`${filePath}:${name}`, enhancedInterface);
    }

    // Parse type aliases that are interface-like
    this.INTERFACE_PATTERNS.type_alias.lastIndex = 0;
    while (
      (match = this.INTERFACE_PATTERNS.type_alias.exec(content)) !== null
    ) {
      const [fullMatch, name, typeDefinition] = match;

      // Only process object-like type aliases
      if (typeDefinition.trim().startsWith("{")) {
        const lineNumber = this.getLineNumber(content, match.index);
        const properties = this.parseInterfaceProperties(typeDefinition);

        const enhancedInterface: EnhancedInterfaceInfo = {
          name,
          file_path: filePath,
          relative_path: relativePath,
          line_number: lineNumber,
          definition: fullMatch,
          properties,
          extends_interfaces: [],
          is_exported: this.isExported(content, match.index),
          is_api_contract: this.isAPIContract(name, properties),
          is_props_interface: this.isPropsInterface(name, properties),
          is_state_interface: this.isStateInterface(name, properties),
          complexity_score: this.calculateComplexityScore(properties),
          usage_frequency: 0,
          semantic_type: this.determineSemanticType(
            name,
            properties,
            typeDefinition,
          ),
          documentation: this.extractDocumentation(lines, lineNumber - 1),
        };

        interfaces.push(enhancedInterface);
        this.interfaceCache.set(`${filePath}:${name}`, enhancedInterface);
      }
    }

    return interfaces;
  }

  /**
   * Parse interface properties from body text
   */
  private parseInterfaceProperties(body: string): InterfaceProperty[] {
    const properties: InterfaceProperty[] = [];

    // Clean up the body
    const cleanBody = body
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    // Parse properties
    const propertyMatches = cleanBody.matchAll(
      this.INTERFACE_PATTERNS.property_declaration,
    );
    for (const match of propertyMatches) {
      const [, name, optional, type] = match;

      properties.push({
        name: name.trim(),
        type: type.trim(),
        is_optional: !!optional,
        is_readonly: false, // Could be enhanced to detect readonly
        is_method: false,
      });
    }

    // Parse methods
    const methodMatches = cleanBody.matchAll(
      this.INTERFACE_PATTERNS.method_declaration,
    );
    for (const match of methodMatches) {
      const [, name, optional, params, returnType] = match;

      properties.push({
        name: name.trim(),
        type: `${params} => ${returnType.trim()}`,
        is_optional: !!optional,
        is_readonly: false,
        is_method: true,
      });
    }

    return properties;
  }

  /**
   * Find implementations of an interface
   */
  private async findInterfaceImplementations(
    interfaceInfo: EnhancedInterfaceInfo,
    fileContent: string,
    fileRecord: ProjectFileRecord,
  ): Promise<InterfaceImplementation[]> {
    const implementations: InterfaceImplementation[] = [];

    // Look for class implementations in the same file
    const classMatches = fileContent.matchAll(
      this.INTERFACE_PATTERNS.class_implements,
    );
    for (const match of classMatches) {
      const [fullMatch, className, implementsList] = match;

      if (implementsList.includes(interfaceInfo.name)) {
        const lineNumber = this.getLineNumber(fileContent, match.index ?? 0);

        // Analyze implementation completeness (simplified)
        const completeness = await this.analyzeImplementationCompleteness(
          interfaceInfo,
          className,
          fileContent,
        );

        implementations.push({
          implementing_entity: className,
          file_path: interfaceInfo.file_path,
          line_number: lineNumber,
          implementation_type: "class",
          completeness: completeness.score,
          missing_properties: completeness.missing,
          additional_properties: completeness.additional,
          confidence: 0.9, // High confidence for explicit implements
        });
      }
    }

    // Look for React component implementations (Props interfaces)
    if (interfaceInfo.is_props_interface) {
      const componentName = interfaceInfo.name.replace(/Props$/, "");
      const componentPattern = new RegExp(
        `(?:function|const)\\s+${componentName}\\s*[:(]|React\\.FC<${interfaceInfo.name}>`,
        "g",
      );

      let componentMatch;
      while ((componentMatch = componentPattern.exec(fileContent)) !== null) {
        const lineNumber = this.getLineNumber(
          fileContent,
          componentMatch.index,
        );

        implementations.push({
          implementing_entity: componentName,
          file_path: interfaceInfo.file_path,
          line_number: lineNumber,
          implementation_type: "component",
          completeness: 0.8, // Assume good completeness for React components
          missing_properties: [],
          additional_properties: [],
          confidence: 0.85,
        });
      }
    }

    return implementations;
  }

  /**
   * Find usages of an interface across the project
   */
  private async findInterfaceUsages(
    interfaceInfo: EnhancedInterfaceInfo,
    allFiles: ProjectFileRecord[],
  ): Promise<InterfaceUsage[]> {
    const usages: InterfaceUsage[] = [];

    // This is a simplified implementation - in reality, you'd want to:
    // 1. Use a proper TypeScript parser
    // 2. Handle imports/exports correctly
    // 3. Track usage across files

    for (const file of allFiles.slice(0, 50)) {
      // Limit for performance
      try {
        const content = await fs.readFile(file.file_path, "utf-8");

        // Simple text search for interface name
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (
            line.includes(interfaceInfo.name) &&
            !line.includes(`interface ${interfaceInfo.name}`) &&
            !line.includes(`type ${interfaceInfo.name}`)
          ) {
            let usageType: InterfaceUsage["usage_type"] = "property";

            if (line.includes(`: ${interfaceInfo.name}`)) {
              usageType = "parameter";
            } else if (line.includes(`): ${interfaceInfo.name}`)) {
              usageType = "return_type";
            } else if (line.includes(`extends ${interfaceInfo.name}`)) {
              usageType = "extends";
            } else if (line.includes(`<${interfaceInfo.name}>`)) {
              usageType = "generic";
            }

            usages.push({
              usage_location: `${file.relative_path}:${i + 1}`,
              file_path: file.file_path,
              line_number: i + 1,
              usage_type: usageType,
              context: line.trim(),
              frequency: 1, // Could be enhanced to count actual usage
            });
          }
        }
      } catch (error) {
        logger.debug(
          `Could not read file for usage analysis: ${file.file_path}`,
        );
      }
    }

    return usages;
  }

  /**
   * Find interfaces related to the given interface
   */
  private async findRelatedInterfaces(
    interfaceInfo: EnhancedInterfaceInfo,
  ): Promise<RelatedInterface[]> {
    // Check cache first
    const cacheKey = `${interfaceInfo.file_path}:${interfaceInfo.name}`;
    if (this.relationshipCache.has(cacheKey)) {
      return this.relationshipCache.get(cacheKey)!;
    }

    const relatedInterfaces: RelatedInterface[] = [];

    // Find interfaces in the same file and related files
    const allInterfaces = Array.from(this.interfaceCache.values());

    for (const otherInterface of allInterfaces) {
      if (
        otherInterface.name === interfaceInfo.name &&
        otherInterface.file_path === interfaceInfo.file_path
      ) {
        continue;
      }

      // Check for explicit extends relationship
      if (interfaceInfo.extends_interfaces.includes(otherInterface.name)) {
        relatedInterfaces.push({
          interface: otherInterface,
          relationship_type: "extends",
          similarity_score: 0.9,
          shared_properties: this.findSharedProperties(
            interfaceInfo,
            otherInterface,
          ),
          reasoning: `${interfaceInfo.name} explicitly extends ${otherInterface.name}`,
        });
        continue;
      }

      // Check for property similarity
      const sharedProperties = this.findSharedProperties(
        interfaceInfo,
        otherInterface,
      );
      if (sharedProperties.length > 0) {
        const similarityScore = this.calculatePropertySimilarity(
          interfaceInfo,
          otherInterface,
        );

        if (similarityScore > 0.3) {
          let relationshipType: RelatedInterface["relationship_type"] =
            "similar";

          if (this.isComposedOf(interfaceInfo, otherInterface)) {
            relationshipType = "composed_of";
          } else if (this.containsInterface(interfaceInfo, otherInterface)) {
            relationshipType = "contains";
          } else if (this.usesInterface(interfaceInfo, otherInterface)) {
            relationshipType = "uses";
          }

          relatedInterfaces.push({
            interface: otherInterface,
            relationship_type: relationshipType,
            similarity_score: similarityScore,
            shared_properties: sharedProperties,
            reasoning: `Shares ${
              sharedProperties.length
            } properties with similarity score ${similarityScore.toFixed(2)}`,
          });
        }
      }
    }

    // Cache the results
    this.relationshipCache.set(cacheKey, relatedInterfaces);

    return relatedInterfaces.slice(0, 10); // Limit to top 10 related interfaces
  }

  /**
   * Map data flow between interfaces
   */
  private async mapDataFlow(
    interfaceInfo: EnhancedInterfaceInfo,
    fileContent: string,
  ): Promise<DataFlowMapping[]> {
    const dataFlowMappings: DataFlowMapping[] = [];

    // This is a simplified implementation
    // In reality, you'd need sophisticated analysis to track data transformations

    // Look for function signatures that transform between interfaces
    const functionPattern =
      /function\s+(\w+)\s*\([^)]*:\s*(\w+)[^)]*\)\s*:\s*(\w+)/g;
    let match;

    while ((match = functionPattern.exec(fileContent)) !== null) {
      const [, functionName, inputType, outputType] = match;

      if (
        inputType === interfaceInfo.name ||
        outputType === interfaceInfo.name
      ) {
        let flowType: DataFlowMapping["flow_type"] = "transformation";

        if (
          inputType === interfaceInfo.name &&
          outputType !== interfaceInfo.name
        ) {
          flowType = "output";
        } else if (
          inputType !== interfaceInfo.name &&
          outputType === interfaceInfo.name
        ) {
          flowType = "input";
        }

        dataFlowMappings.push({
          source_interface: inputType,
          target_interface: outputType,
          flow_type: flowType,
          transformation_logic: functionName,
          components_involved: [functionName],
          confidence: 0.7,
        });
      }
    }

    return dataFlowMappings;
  }

  /**
   * Detect API endpoints related to interfaces
   */
  private async detectAPIEndpoints(
    interfaceInfo: EnhancedInterfaceInfo,
    fileContent: string,
  ): Promise<APIEndpointInfo[]> {
    const endpoints: APIEndpointInfo[] = [];

    if (!interfaceInfo.is_api_contract) {
      return endpoints;
    }

    // Look for REST API patterns
    const restPatterns = [
      /app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g,
      /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g,
      /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"`]([^'"`]+)['"`]/g, // NestJS decorators
    ];

    for (const pattern of restPatterns) {
      let match;
      while ((match = pattern.exec(fileContent)) !== null) {
        const [, method, path] = match;

        // Check if this endpoint uses the interface
        const surroundingCode = this.getSurroundingCode(
          fileContent,
          match.index,
          10,
        );
        if (surroundingCode.includes(interfaceInfo.name)) {
          endpoints.push({
            endpoint_path: path,
            method: method.toUpperCase(),
            request_interface: interfaceInfo.name.includes("Request")
              ? interfaceInfo.name
              : undefined,
            response_interface: interfaceInfo.name.includes("Response")
              ? interfaceInfo.name
              : undefined,
          });
        }
      }
    }

    return endpoints;
  }

  /**
   * Build comprehensive interface relationship graph
   */
  private async buildInterfaceRelationshipGraph(
    analysisResults: InterfaceAnalysisResult[],
  ): Promise<InterfaceRelationshipGraph> {
    const nodes: InterfaceRelationshipGraph["nodes"] = [];
    const edges: InterfaceRelationshipGraph["edges"] = [];
    const interfaceUsageCounts = new Map<string, number>();

    // Build nodes and count usages
    for (const result of analysisResults) {
      const usageCount = result.usages.length + result.implementations.length;
      interfaceUsageCounts.set(result.interface.name, usageCount);

      // Calculate centrality based on usage and relationships
      const centrality = this.calculateInterfaceCentrality(result);

      nodes.push({
        interface: result.interface,
        centrality,
      });
    }

    // Build edges from relationships
    for (const result of analysisResults) {
      for (const related of result.related_interfaces) {
        edges.push({
          from: result.interface.name,
          to: related.interface.name,
          relationship_type: related.relationship_type,
          weight: related.similarity_score,
          properties: {
            shared_properties: related.shared_properties.length,
            reasoning: related.reasoning,
          },
        });
      }

      // Add data flow edges
      for (const flow of result.data_flow) {
        edges.push({
          from: flow.source_interface,
          to: flow.target_interface,
          relationship_type: `data_${flow.flow_type}`,
          weight: flow.confidence,
          properties: {
            flow_type: flow.flow_type,
            components: flow.components_involved,
          },
        });
      }
    }

    // Create clusters based on interface domains
    const clusters = this.createInterfaceClusters(analysisResults);

    return { nodes, edges, clusters };
  }

  // Helper methods

  private getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split("\n").length;
  }

  private isExported(content: string, matchIndex: number): boolean {
    const lineStart = content.lastIndexOf("\n", matchIndex) + 1;
    const line = content.substring(lineStart, matchIndex + 100);
    return line.includes("export");
  }

  private isAPIContract(
    name: string,
    properties: InterfaceProperty[],
  ): boolean {
    const apiKeywords = [
      "request",
      "response",
      "api",
      "endpoint",
      "payload",
      "dto",
    ];
    const nameMatch = apiKeywords.some((keyword) =>
      name.toLowerCase().includes(keyword),
    );
    const propertyMatch = properties.some((prop) =>
      ["status", "code", "message", "data", "error"].includes(
        prop.name.toLowerCase(),
      ),
    );
    return nameMatch || propertyMatch;
  }

  private isPropsInterface(
    name: string,
    properties: InterfaceProperty[],
  ): boolean {
    return name.endsWith("Props") || name.endsWith("Properties");
  }

  private isStateInterface(
    name: string,
    properties: InterfaceProperty[],
  ): boolean {
    return name.endsWith("State") || name.includes("State");
  }

  private calculateComplexityScore(properties: InterfaceProperty[]): number {
    let score = properties.length * 0.1;

    // Add complexity for methods
    score += properties.filter((p) => p.is_method).length * 0.2;

    // Add complexity for generic types
    score += properties.filter((p) => p.type.includes("<")).length * 0.15;

    // Add complexity for optional properties (they add branching)
    score += properties.filter((p) => p.is_optional).length * 0.05;

    return Math.min(score, 1.0);
  }

  private determineSemanticType(
    name: string,
    properties: InterfaceProperty[],
    body: string,
  ): CodeSemanticType {
    if (this.isAPIContract(name, properties)) return "api_endpoint";
    if (this.isPropsInterface(name, properties)) return "interface_definition";
    if (name.includes("Config") || name.includes("Settings"))
      return "configuration";
    if (body.includes("extends") || properties.some((p) => p.name === "id"))
      return "interface_definition";
    return "type_annotation";
  }

  private extractDocumentation(
    lines: string[],
    lineIndex: number,
  ): string | undefined {
    // Look for JSDoc comment above the interface
    let docLines: string[] = [];
    let i = lineIndex - 1;

    // Skip empty lines
    while (i >= 0 && lines[i].trim() === "") i--;

    // Check for JSDoc ending
    if (i >= 0 && lines[i].trim().endsWith("*/")) {
      docLines.unshift(lines[i]);
      i--;

      while (i >= 0) {
        docLines.unshift(lines[i]);
        if (lines[i].trim().startsWith("/**")) break;
        i--;
      }
    }

    if (docLines.length > 0) {
      return docLines
        .join("\n")
        .replace(/^\s*\*\s?/gm, "")
        .trim();
    }

    return undefined;
  }

  private extractGenericParameters(definition: string): string[] {
    const match = definition.match(this.INTERFACE_PATTERNS.generic_parameters);
    if (match) {
      return match[1].split(",").map((s) => s.trim());
    }
    return [];
  }

  private async storeInterfaceInDatabase(
    interfaceInfo: EnhancedInterfaceInfo,
    fileRecord: ProjectFileRecord,
  ): Promise<CodeInterfaceRecord | null> {
    // This would integrate with the project analysis operations
    // For now, this is a placeholder
    return null;
  }

  private async analyzeImplementationCompleteness(
    interfaceInfo: EnhancedInterfaceInfo,
    className: string,
    fileContent: string,
  ): Promise<{ score: number; missing: string[]; additional: string[] }> {
    // Simplified analysis - in reality you'd need proper AST parsing
    const requiredProps = interfaceInfo.properties
      .filter((p) => !p.is_optional)
      .map((p) => p.name);
    const missing: string[] = [];
    const additional: string[] = [];

    for (const prop of requiredProps) {
      if (!fileContent.includes(prop)) {
        missing.push(prop);
      }
    }

    const score = Math.max(0, 1 - missing.length / requiredProps.length);

    return { score, missing, additional };
  }

  private findSharedProperties(
    interface1: EnhancedInterfaceInfo,
    interface2: EnhancedInterfaceInfo,
  ): string[] {
    const props1 = new Set(interface1.properties.map((p) => p.name));
    const props2 = new Set(interface2.properties.map((p) => p.name));

    return Array.from(props1).filter((prop) => props2.has(prop));
  }

  private calculatePropertySimilarity(
    interface1: EnhancedInterfaceInfo,
    interface2: EnhancedInterfaceInfo,
  ): number {
    const sharedProps = this.findSharedProperties(interface1, interface2);
    const totalProps = new Set([
      ...interface1.properties.map((p) => p.name),
      ...interface2.properties.map((p) => p.name),
    ]).size;

    return totalProps > 0 ? sharedProps.length / totalProps : 0;
  }

  private isComposedOf(
    interface1: EnhancedInterfaceInfo,
    interface2: EnhancedInterfaceInfo,
  ): boolean {
    // Check if interface1 contains interface2 as a property type
    return interface1.properties.some((p) => p.type.includes(interface2.name));
  }

  private containsInterface(
    interface1: EnhancedInterfaceInfo,
    interface2: EnhancedInterfaceInfo,
  ): boolean {
    return (
      interface1.properties.length > interface2.properties.length &&
      this.findSharedProperties(interface1, interface2).length >=
        interface2.properties.length * 0.8
    );
  }

  private usesInterface(
    interface1: EnhancedInterfaceInfo,
    interface2: EnhancedInterfaceInfo,
  ): boolean {
    return interface1.properties.some(
      (p) =>
        p.type.includes(interface2.name) ||
        (p.is_method && p.type.includes(interface2.name)),
    );
  }

  private getSurroundingCode(
    content: string,
    index: number,
    lines: number,
  ): string {
    const start = Math.max(0, content.lastIndexOf("\n", index - 1));
    const end = Math.min(content.length, content.indexOf("\n", index + 1));

    const linesBefore = content.substring(0, start).split("\n").slice(-lines);
    const linesAfter = content.substring(end).split("\n").slice(0, lines);
    const currentLine = content.substring(start, end);

    return [...linesBefore, currentLine, ...linesAfter].join("\n");
  }

  private calculateInterfaceCentrality(
    result: InterfaceAnalysisResult,
  ): number {
    const usageWeight = result.usages.length * 0.3;
    const implementationWeight = result.implementations.length * 0.4;
    const relationshipWeight = result.related_interfaces.length * 0.2;
    const apiWeight = result.api_endpoints?.length || 0 * 0.1;

    return Math.min(
      1.0,
      usageWeight + implementationWeight + relationshipWeight + apiWeight,
    );
  }

  private createInterfaceClusters(
    analysisResults: InterfaceAnalysisResult[],
  ): InterfaceRelationshipGraph["clusters"] {
    // Simplified clustering based on naming patterns and domains
    const clusters = new Map<string, string[]>();

    for (const result of analysisResults) {
      const iface = result.interface;
      let domain = "general";

      if (iface.is_api_contract) domain = "api";
      else if (iface.is_props_interface) domain = "ui-components";
      else if (iface.name.includes("State") || iface.name.includes("Store"))
        domain = "state-management";
      else if (iface.name.includes("Config") || iface.name.includes("Settings"))
        domain = "configuration";
      else if (iface.name.includes("Data") || iface.name.includes("Model"))
        domain = "data-layer";

      if (!clusters.has(domain)) {
        clusters.set(domain, []);
      }
      clusters.get(domain)!.push(iface.name);
    }

    return Array.from(clusters.entries()).map(([domain, interfaces]) => ({
      id: domain,
      name: domain.charAt(0).toUpperCase() + domain.slice(1).replace("-", " "),
      interfaces,
      domain,
    }));
  }

  /**
   * Get interface mapping statistics
   */
  getStatistics(): {
    total_interfaces: number;
    interfaces_by_type: { [type: string]: number };
    cache_size: number;
    relationship_cache_size: number;
    api_contracts: number;
    props_interfaces: number;
    complexity_distribution: { low: number; medium: number; high: number };
  } {
    const allInterfaces = Array.from(this.interfaceCache.values());

    const interfacesByType = allInterfaces.reduce(
      (acc, iface) => {
        acc[iface.semantic_type] = (acc[iface.semantic_type] || 0) + 1;
        return acc;
      },
      {} as { [type: string]: number },
    );

    const complexityDistribution = allInterfaces.reduce(
      (acc, iface) => {
        if (iface.complexity_score < 0.3) acc.low++;
        else if (iface.complexity_score < 0.7) acc.medium++;
        else acc.high++;
        return acc;
      },
      { low: 0, medium: 0, high: 0 },
    );

    return {
      total_interfaces: allInterfaces.length,
      interfaces_by_type: interfacesByType,
      cache_size: this.interfaceCache.size,
      relationship_cache_size: this.relationshipCache.size,
      api_contracts: allInterfaces.filter((i) => i.is_api_contract).length,
      props_interfaces: allInterfaces.filter((i) => i.is_props_interface)
        .length,
      complexity_distribution: complexityDistribution,
    };
  }

  /**
   * Clear caches
   */
  clearCaches(): void {
    this.interfaceCache.clear();
    this.relationshipCache.clear();
    logger.info(" Cleared interface mapper caches");
  }
}
