import path from "path";

export function resolveOwnedPath(
  requestedPath: string | undefined,
  label: string,
  basePath: string = process.env.MEMORY_PATH || process.cwd(),
): string {
  const resolvedBase = path.resolve(basePath);
  const resolvedPath = path.resolve(requestedPath || resolvedBase);

  if (process.env.MEMORY_ALLOW_OUT_OF_ROOT === "1") {
    return resolvedPath;
  }

  const relative = path.relative(resolvedBase, resolvedPath);
  const isInside =
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative));

  if (!isInside) {
    throw new Error(
      `${label} must be within the monitored root (${resolvedBase}). Set MEMORY_ALLOW_OUT_OF_ROOT=1 to opt out.`,
    );
  }

  return resolvedPath;
}

export function resolveOwnedFilePath(filePath: string, rootPath: string): string {
  return resolveOwnedPath(filePath, "file path", rootPath);
}
