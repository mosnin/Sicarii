"use client";

import { useState } from "react";
import Image from "next/image";
import { X, Download, FileText, FileImage, File as FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FilePreviewProps {
  name: string;
  url: string;
  type?: string;
  size?: string;
}

function getFileCategory(name: string, type?: string): "image" | "pdf" | "svg" | "other" {
  const ext = name.split(".").pop()?.toLowerCase();
  // SVG files can contain embedded scripts — never render them inline.
  if (ext === "svg" || type === "image/svg+xml") {
    return "svg";
  }
  if (type?.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp"].includes(ext || "")) {
    return "image";
  }
  if (type === "application/pdf" || ext === "pdf") {
    return "pdf";
  }
  return "other";
}

function getFileIcon(category: "image" | "pdf" | "svg" | "other") {
  switch (category) {
    case "image": return FileImage;
    case "pdf": return FileText;
    case "svg": return FileImage;
    default: return FileIcon;
  }
}

export function FilePreviewCard({ name, url, type, size }: FilePreviewProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const category = getFileCategory(name, type);
  const Icon = getFileIcon(category);
  const canPreview = (category === "image" || category === "pdf");

  return (
    <>
      <div
        className={`flex items-center gap-3 rounded-lg border border-border p-3 transition-colors ${canPreview ? "hover:bg-muted cursor-pointer" : ""}`}
        onClick={() => canPreview && setPreviewOpen(true)}
      >
        {/* Thumbnail */}
        {category === "image" ? (
          <div className="relative h-10 w-10 shrink-0 rounded-md overflow-hidden bg-muted">
            <Image src={url} alt={name} fill className="object-cover" sizes="40px" />
          </div>
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-orange/10">
            <Icon className="h-5 w-5 text-orange" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{name}</p>
          {size && <p className="text-xs text-muted-foreground">{size}</p>}
        </div>
        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" asChild>
          <a href={url} download={name} onClick={(e) => e.stopPropagation()}>
            <Download className="h-4 w-4" />
          </a>
        </Button>
      </div>

      {/* Full preview modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPreviewOpen(false)} />
          <div className="relative w-full max-w-4xl max-h-[85vh] rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-fade-in">
            {/* Preview header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-sm font-medium truncate">{name}</p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild>
                  <a href={url} download={name}>
                    <Download className="mr-1 h-4 w-4" /> Download
                  </a>
                </Button>
                <button
                  onClick={() => setPreviewOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Preview content */}
            <div className="overflow-auto max-h-[calc(85vh-56px)] flex items-center justify-center p-4">
              {category === "image" ? (
                <Image
                  src={url}
                  alt={name}
                  width={1200}
                  height={800}
                  className="max-w-full h-auto rounded-lg"
                  style={{ maxHeight: "calc(85vh - 100px)" }}
                />
              ) : category === "pdf" ? (
                <iframe
                  src={url}
                  className="w-full h-[calc(85vh-100px)] rounded-lg"
                  title={name}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
