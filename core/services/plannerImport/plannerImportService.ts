import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { PlannerImportResult } from "../../shared/types/plannerImport";


const LOCAL_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

export type ExtractPlannerOptions = {
  filename?: string;
  useLlm?: boolean;
  model?: string;
  llmRetries?: number;
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

  const parsed = JSON.parse(trimmed) as PlannerImportResult & { error?: string };
  if (parsed && typeof parsed === "object" && "error" in parsed && parsed.error) {
    throw new Error(String(parsed.error));
  }
  if (!parsed?.planner || !parsed?.report) {
    throw new Error("Planner import returned an unexpected payload shape.");
  }
  return parsed;
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
    if (options.useLlm === false) args.push("--no-llm");
    if (options.model) args.push("--model", options.model);
    if (typeof options.llmRetries === "number") args.push("--llm-retries", String(options.llmRetries));

    const result = await new Promise<PlannerImportResult>((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          // Force the extractor to call the app-managed local Ollama runtime.
          // A caller can still override this for diagnostics with STUDY_PLANNER_OLLAMA_URL.
          STUDY_PLANNER_OLLAMA_URL:
            process.env.STUDY_PLANNER_OLLAMA_URL?.trim() || LOCAL_OLLAMA_BASE_URL,
        },
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
