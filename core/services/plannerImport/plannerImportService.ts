import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { PlannerImportResult } from "../../shared/types/plannerImport";

export type ExtractPlannerOptions = {
  filename?: string;
};

type PythonCommand = {
  executable: string;
  prefixArgs: string[];
};

// Resolve whether the app should call the packaged extractor binary or the local Python script.
function resolvePythonCommand(): PythonCommand {
  if ((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath) {
    const ext = process.platform === "win32" ? ".exe" : "";
    const resourcesPath = (process as NodeJS.Process & { resourcesPath: string }).resourcesPath;
    const binary = path.join(resourcesPath, `plannerStructureService${ext}`);
    return { executable: binary, prefixArgs: [] };
  }

  const executable = process.env.PYTHON_EXECUTABLE?.trim() || "python3";
  const scriptPath = path.join(
    process.cwd(),
    "core", "services", "plannerImport", "plannerStructureService.py"
  );
  return { executable, prefixArgs: [scriptPath] };
}

// Sanitise the uploaded filename before writing it into the temporary import directory.
function sanitiseFilename(filename: string): string {
  const base = path.basename(filename || "planner.pdf");
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
}

// Parse and validate the extractor stdout so API callers always receive the app JSON contract.
function parsePlannerImportResult(stdout: string): PlannerImportResult {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Planner import returned no JSON output.");
  }

  // Some fallback libraries can write diagnostics to stdout, so recover the complete contract object instead of parsing the entire stream as JSON.
  for (let start = 0; start < trimmed.length; start += 1) {
    if (trimmed[start] !== "{") continue;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < trimmed.length; index += 1) {
      const character = trimmed[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth !== 0) continue;

        let parsed: PlannerImportResult & { error?: string };
        try {
          parsed = JSON.parse(trimmed.slice(start, index + 1)) as PlannerImportResult & { error?: string };
        } catch {
          break;
        }
        if (parsed?.error) throw new Error(String(parsed.error));
        if (parsed?.planner && parsed?.report) return parsed;
        break;
      }
    }
  }

  throw new Error("Planner import returned no valid JSON payload.");
}

// Persist the uploaded PDF temporarily, run the Python extraction pipeline, and return structured planner data.
export async function extractPlannerFromPdf(
  pdfBuffer: Buffer,
  options: ExtractPlannerOptions = {}
): Promise<PlannerImportResult> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "study-planner-import-"));
  const tempFile = path.join(tempDir, sanitiseFilename(options.filename || "planner.pdf"));

  try {
    await writeFile(tempFile, pdfBuffer);

    const { executable, prefixArgs } = resolvePythonCommand();
    const args = [...prefixArgs, tempFile];

    const result = await new Promise<PlannerImportResult>((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr.trim() || `Planner import exited with code ${code}`));
          return;
        }

        try {
          resolve(parsePlannerImportResult(stdout));
        } catch (error) {
          reject(error);
        }
      });
    });

    return result;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
