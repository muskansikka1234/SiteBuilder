import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";

import type { Project } from "../types";
import { iframeScript } from "../assets/assets";
import EditorPanel from "./EditorPanel";
import LoaderSteps from "./LoaderSteps";

import he from "he";
import DOMPurify from "dompurify";

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

const resolutions = {
  phone: "w-[412px]",
  tablet: "w-[768px]",
  desktop: "w-full"
};

/* -----------------------------
   Debug generated HTML
------------------------------*/
useEffect(() => {
  if (project.current_code) {
    console.log("Generated HTML:", he.decode(project.current_code));
  }
}, [project.current_code]);

/* -----------------------------
   Expose method to parent
------------------------------*/
useImperativeHandle(ref, () => ({
  getCode: () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return undefined;

    doc
      .querySelectorAll(".ai-selected-element,[data-ai-selected]")
      .forEach((el) => {
        el.classList.remove("ai-selected-element");
        el.removeAttribute("data-ai-selected");
        (el as HTMLElement).style.outline = "";
      });

    const previewStyle = doc.getElementById("ai-preview-style");
    if (previewStyle) previewStyle.remove();

    const previewScript = doc.getElementById("ai-preview-script");
    if (previewScript) previewScript.remove();

    return doc.documentElement.outerHTML;
  }
}));

/* -----------------------------
   Listen to iframe messages
------------------------------*/
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

/* -----------------------------
   Update element in iframe
------------------------------*/
const handleUpdate = (updates: any) => {
  if (iframeRef.current?.contentWindow) {
    iframeRef.current.contentWindow.postMessage(
      {
        type: "UPDATE_ELEMENT",
        payload: updates
      },
      "*"
    );
  }
};

/* -----------------------------
   Create SAFE preview document
------------------------------*/
const buildPreviewDocument = (html: string) => {

  if (!html) return "";

  let content = he.decode(html);

  // Remove ALL script blocks
  content = content.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");

  // Remove Tailwind config fragments
  content = content.replace(/tailwind\.config\s*=\s*{[\s\S]*?};?/gi, "");

  // Remove inline JS events
  content = content.replace(/\son\w+="[^"]*"/g, "");

  // Remove stray JS statements
  content = content.replace(/tailwind\.[^;]+;/g, "");

  // Sanitize HTML safely using DOMPurify
  content = DOMPurify.sanitize(content, {
    FORBID_TAGS: ["script"],
    FORBID_ATTR: ["onclick", "onerror", "onload"]
  });

  return `
<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<script src="https://cdn.tailwindcss.com"></script>

<style>
body{
  margin:0;
  padding:0;
}
</style>

</head>

<body>

<div id="preview-root">
${content}
</div>

${showEditorPanel ? iframeScript : ""}

</body>
</html>
`;
};

return (
<div className="relative h-full bg-gray-900 flex-1 rounded-xl overflow-hidden max-sm:ml-2">

{project.current_code ? (

<>
<iframe
ref={iframeRef}
sandbox="allow-scripts allow-same-origin"
srcDoc={buildPreviewDocument(project.current_code)}
className={`h-full max-sm:w-full ${resolutions[device]} mx-auto transition-all`}
/>

{showEditorPanel && selectedElement && (
<EditorPanel
selectedElement={selectedElement}
onUpdate={handleUpdate}
onClose={() => {

setSelectedElement(null);

if (iframeRef.current?.contentWindow) {
iframeRef.current.contentWindow.postMessage(
{ type: "CLEAR_SELECTION_REQUEST" },
"*"
);
}

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