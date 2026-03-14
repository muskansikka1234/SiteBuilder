import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useMemo
} from "react";
import type { Project } from "../types";
import { iframeScript } from "../assets/assets";
import EditorPanel from "./EditorPanel";
import LoaderSteps from "./LoaderSteps";
import he from "he";
import DOMPurify from "dompurify";

// --- PURE UTILITY FUNCTIONS (OUTSIDE COMPONENT) ---

/**
 * Strips AI junk and rebuilds a clean, standard HTML document
 * with a reliable Tailwind initialization loop.
 */
const buildPreviewDocument = (html: string, showEditorPanel: boolean) => {
  if (!html) return "";

  // 1. Clean the AI garbage (markdown blocks)
  let decoded = he.decode(html).replace(/```html|```/g, "").trim();

  // 2. Extract Tailwind Config
  let extractedConfig = "{}";
  const configBlockMatch = decoded.match(/tailwind\.config\s*=\s*({[\s\S]*?})(;|\s|<|$)/);
  if (configBlockMatch) {
    extractedConfig = configBlockMatch[1];
  } else {
    const themeMatch = decoded.match(/theme:\s*{[\s\S]*?}\s*}\s*}/);
    if (themeMatch) extractedConfig = `{ ${themeMatch[0]} }`;
  }

  // 3. SURGERY: Strip AI-generated structural tags to prevent nesting
  let bodyContent = decoded
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<!DOCTYPE html>/gi, "")
    .replace(/<\/?html[^>]*>/gi, "")
    .replace(/<\/?head[^>]*>/gi, "")
    .replace(/<body[^>]*>([\s\S]*)<\/body>/i, '$1');

  // 4. SANITIZE: Double check that no naked JS is left
  const cleanBody = DOMPurify.sanitize(bodyContent, {
    ADD_TAGS: ["style"],
    FORBID_TAGS: ["script"],
    FORBID_ATTR: ["onclick", "onerror", "onload"]
  });

  // 5. REBUILD: Return as a clean standalone document string
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    (function() {
      const init = () => {
        if (window.tailwind) {
          try {
            tailwind.config = ${extractedConfig};
          } catch (e) { console.error("Tailwind Config Error", e); }
        } else {
          setTimeout(init, 50);
        }
      };
      init();
    })();
  </script>
  <style>
    body { margin: 0; padding: 0; background-color: white; min-height: 100vh; }
    #preview-root { height: 100%; width: 100%; }
  </style>
</head>
<body>
  <div id="preview-root">
    ${cleanBody}
  </div>
  ${showEditorPanel ? iframeScript : ""}
</body>
</html>`.trim();
};

// --- COMPONENT ---

interface ProjectPreviewProps {
  project: Project;
  isGenerating: boolean;
  device?: "phone" | "tablet" | "desktop";
  showEditorPanel?: boolean;
}

export interface ProjectPreviewRef {
  getCode: () => string | undefined;
}

const ProjectPreview = forwardRef<ProjectPreviewRef, ProjectPreviewProps>(
  ({ project, isGenerating, device = "desktop", showEditorPanel = true }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [selectedElement, setSelectedElement] = useState<any>(null);
    const [blobUrl, setBlobUrl] = useState<string>("");

    const resolutions = {
      phone: "w-[412px]",
      tablet: "w-[768px]",
      desktop: "w-full"
    };

    // --- BLOB URL GENERATION ---
    // This is the "secret sauce" for deployed sites. 
    // It turns the HTML string into a temporary URL.
    useEffect(() => {
      if (!project.current_code) return;

      const htmlContent = buildPreviewDocument(project.current_code, showEditorPanel);
      const blob = new Blob([htmlContent], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      
      setBlobUrl(url);

      // Cleanup to prevent memory leaks
      return () => URL.revokeObjectURL(url);
    }, [project.current_code, project.id, showEditorPanel]);

    useImperativeHandle(ref, () => ({
      getCode: () => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return undefined;
        
        // Clean up editor artifacts before exporting code
        const exportDoc = doc.cloneNode(true) as Document;
        exportDoc.querySelectorAll(".ai-selected-element, [data-ai-selected]")
          .forEach((el) => {
            el.classList.remove("ai-selected-element");
            el.removeAttribute("data-ai-selected");
            (el as HTMLElement).style.outline = "";
          });

        const previewStyle = exportDoc.getElementById("ai-preview-style");
        const previewScript = exportDoc.getElementById("ai-preview-script");
        if (previewStyle) previewStyle.remove();
        if (previewScript) previewScript.remove();

        return exportDoc.documentElement.outerHTML;
      }
    }));

    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === "ELEMENT_SELECTED") {
          setSelectedElement(event.data.payload);
        } else if (event.data.type === "CLEAR_SELECTION") {
          setSelectedElement(null);
        }
      };
      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }, []);

    const handleUpdate = (updates: any) => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type: "UPDATE_ELEMENT", payload: updates },
          "*"
        );
      }
    };

    return (
      <div className="relative h-full bg-gray-900 flex-1 rounded-xl overflow-hidden max-sm:ml-2">
        {project.current_code && blobUrl ? (
          <>
            <iframe
              ref={iframeRef}
              key={project.id} 
              sandbox="allow-scripts allow-same-origin allow-modals"
              src={blobUrl} // Using src with Blob URL instead of srcDoc
              className={`h-full max-sm:w-full ${resolutions[device]} mx-auto transition-all bg-white border-none`}
            />
            
            {showEditorPanel && selectedElement && (
              <EditorPanel
                selectedElement={selectedElement}
                onUpdate={handleUpdate}
                onClose={() => {
                  setSelectedElement(null);
                  iframeRef.current?.contentWindow?.postMessage({ 
                    type: 'CLEAR_SELECTION_REQUEST' 
                  }, '*');
                }}
              />
            )}
          </>
        ) : (
          isGenerating && <LoaderSteps />
        )}
      </div>
    );
  }
);

export default ProjectPreview;