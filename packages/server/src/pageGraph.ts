import fs from "fs";
import path from "path";

export interface PageGraph {
  pageFile: string;
  layouts: string[];
  clientFiles: string[];
  pageCss: string[];
  clientCss: string[];
  cssFiles: string[];
}

export function isClientComponent(filePath: string) {
  try {
    const buf = fs.readFileSync(filePath, "utf8");
    const firstStmt = buf
      .split(/\r?\n/)
      .slice(0, 10)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("//") && !line.startsWith("/*"))[0];
    return /^['"]use client['"]\s*;?$/.test(firstStmt ?? "");
  } catch {
    return false;
  }
}

export function clientIdFor(filePath: string) {
  return path.relative(process.cwd(), filePath).split(path.sep).join("/");
}

export function getImports(filePath: string): string[] {
  try {
    const src = fs.readFileSync(filePath, "utf8");
    const importRegex =
      /import\s+(?:[\s\S]+?\s+from\s+)?['"]([^'"]+)['"]/g;
    const imports: string[] = [];
    let match;
    while ((match = importRegex.exec(src))) {
      const raw = match[1];
      if (raw.startsWith(".")) {
        const resolved = path.resolve(path.dirname(filePath), raw);
        const extResolved =
          fs.existsSync(resolved) && fs.statSync(resolved).isFile()
            ? resolved
            : [".tsx", ".ts", ".jsx", ".js", ".css"]
                .map((ext) => resolved + ext)
                .find((candidate) => fs.existsSync(candidate));
        if (extResolved) imports.push(extResolved);
      }
    }
    return imports;
  } catch {
    return [];
  }
}

function layoutChain(pageFile: string): string[] {
  const routesRoot = path.resolve(process.cwd(), "routes");
  const pageDir = path.dirname(path.resolve(pageFile));
  const relative = path.relative(routesRoot, pageDir);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return [];

  const directories: string[] = [];
  let current = pageDir;
  while (true) {
    directories.push(current);
    if (current === routesRoot) break;
    current = path.dirname(current);
  }
  directories.reverse();

  return directories
    .map((directory) => path.join(directory, "layout.tsx"))
    .filter((layout) => fs.existsSync(layout));
}

function collectClientFiles(
  filePath: string,
  seen: Set<string>,
  found: Set<string>
) {
  if (!filePath || seen.has(filePath) || !fs.existsSync(filePath)) return;
  seen.add(filePath);
  if (isClientComponent(filePath)) found.add(filePath);
  for (const imported of getImports(filePath)) {
    collectClientFiles(imported, seen, found);
  }
}

function isReadableFile(filePath: string) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function collectCssFiles(
  filePath: string,
  enterClientComponents: boolean,
  seenFiles: Set<string>,
  seenCss: Set<string>,
  output: string[]
) {
  if (!filePath || seenFiles.has(filePath)) return;
  seenFiles.add(filePath);
  if (!isReadableFile(filePath)) return;

  if (filePath.endsWith(".css")) {
    if (!seenCss.has(filePath)) {
      seenCss.add(filePath);
      output.push(filePath);
    }
    return;
  }

  if (!enterClientComponents && isClientComponent(filePath)) return;
  for (const imported of getImports(filePath)) {
    collectCssFiles(
      imported,
      enterClientComponents,
      seenFiles,
      seenCss,
      output
    );
  }
}

/**
 * Discovers everything a Page owns: its Layout chain, Client Components, and
 * CSS. The Page file is the only input, so Route Groups and Dynamic Routes
 * resolve without a URL.
 */
export function getPageGraph(pageFile: string): PageGraph {
  const resolvedPage = path.resolve(pageFile);
  const layouts = layoutChain(resolvedPage);

  const seenClientFiles = new Set<string>();
  const clientFiles = new Set<string>();
  collectClientFiles(resolvedPage, seenClientFiles, clientFiles);
  for (const layout of layouts) {
    collectClientFiles(layout, seenClientFiles, clientFiles);
  }
  const sortedClientFiles = [...clientFiles].sort();

  const seenCss = new Set<string>();
  const pageCss: string[] = [];
  const pageWalkSeen = new Set<string>();
  for (const file of [...layouts, resolvedPage]) {
    collectCssFiles(file, false, pageWalkSeen, seenCss, pageCss);
  }

  const clientCss: string[] = [];
  const clientWalkSeen = new Set<string>();
  for (const file of sortedClientFiles) {
    collectCssFiles(file, true, clientWalkSeen, seenCss, clientCss);
  }

  return {
    pageFile: resolvedPage,
    layouts,
    clientFiles: sortedClientFiles,
    pageCss,
    clientCss,
    cssFiles: [...pageCss, ...clientCss],
  };
}
