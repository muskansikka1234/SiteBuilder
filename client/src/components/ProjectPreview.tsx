import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Project } from '../types';
import { iframeScript } from '../assets/assets';
import EditorPanel from './EditorPanel';
import LoaderSteps from './LoaderSteps';
import he from 'he';

interface ProjectPreviewProps {
  project: Project;
  isGenerating: boolean;
  device?: 'phone' | 'tablet' | 'desktop';
  showEditorPanel?: boolean;
}

export interface ProjectPreviewRef {
  getCode: () => string | undefined;
}

const ProjectPreview = forwardRef<ProjectPreviewRef, ProjectPreviewProps>(
  ({ project, isGenerating, device = 'desktop', showEditorPanel = true }, ref) => {

    const iframeref = useRef<HTMLIFrameElement>(null);
    const [selectedElement, setSelectedElement] = useState<any>(null);

    const resolutions = {
      phone: 'w-[412px]',
      tablet: 'w-[768px]',
      desktop: 'w-full'
    };

    // Expose method to get clean HTML from iframe
    useImperativeHandle(ref, () => ({
      getCode: () => {
        const doc = iframeref.current?.contentDocument;
        if (!doc) return undefined;

        // Remove selection classes/styles
        doc.querySelectorAll('.ai-selected-element,[data-ai-selected]').forEach((el) => {
          el.classList.remove('ai-selected-element');
          el.removeAttribute('data-ai-selected');
          (el as HTMLElement).style.outline = '';
        });

        // Remove injected style + script
        doc.getElementById('ai-preview-style')?.remove();
        doc.getElementById('ai-preview-script')?.remove();

        return doc.documentElement.outerHTML;
      }
    }));

    // Listen for selection messages from iframe
    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'ELEMENT_SELECTED') {
          setSelectedElement(event.data.payload);
        } else if (event.data.type === 'CLEAR_SELECTION') {
          setSelectedElement(null);
        }
      };
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Send updates to selected element inside iframe
    const handleUpdate = (updates: any) => {
      if (iframeref.current?.contentWindow) {
        iframeref.current.contentWindow.postMessage({
          type: 'UPDATE_ELEMENT',
          payload: updates
        }, '*');
      }
    };

    // Prepare iframe HTML with Tailwind + editor scripts
    const injectPreview = (html: string) => {
      if (!html) return '';

      const decodedHtml = he.decode(html);

      return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script src="https://cdn.tailwindcss.com"></script>
        <style id="ai-preview-style"></style>
      </head>
      <body>
        ${decodedHtml}
        ${showEditorPanel ? iframeScript : ''}
        <script id="ai-preview-script"></script>
      </body>
      </html>
      `;
    };

    return (
      <div className="relative h-full bg-gray-900 flex-1 rounded-xl overflow-hidden max-sm:ml-2">
        {project.current_code ? (
          <>
            <iframe
              ref={iframeref}
              srcDoc={injectPreview(project.current_code)}
              className={`h-full max-sm:w-full ${resolutions[device]} mx-auto transition-all`}
            />
            {showEditorPanel && selectedElement && (
              <EditorPanel
                selectedElement={selectedElement}
                onUpdate={handleUpdate}
                onClose={() => {
                  setSelectedElement(null);
                  iframeref.current?.contentWindow?.postMessage({ type: 'CLEAR_SELECTION_REQUEST' }, '*');
                }}
              />
            )}
          </>
        ) : isGenerating && (
          <LoaderSteps />
        )}
      </div>
    );
  }
);

export default ProjectPreview;