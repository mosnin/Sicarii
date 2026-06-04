"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Send, MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  content: string;
  role: "client" | "admin";
  senderId: string;
  createdAt: string;
}

interface Project {
  id: string;
  name: string;
  serviceType: string;
}

export default function MessagesPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch projects
  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProjects(data);
          if (data.length > 0) setSelectedProjectId(data[0].id);
        }
      })
      .catch(() => {
        setError("Failed to load projects. Please try again.");
        setLoading(false);
      })
      .finally(() => setLoading(false));
  }, []);

  // Fetch messages when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    setMessages([]);
    fetch(`/api/messages?projectId=${selectedProjectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setMessages(data);
        }
      })
      .catch(() => {
        setMessages([]);
      });
  }, [selectedProjectId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedProjectId) return;

    setSending(true);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          content: newMessage,
        }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => [...prev, msg]);
        setNewMessage("");
      }
    } catch {
      window.alert("Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Messages</h1>
          <p className="text-muted-foreground mt-1">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Messages</h1>
        <p className="text-muted-foreground mt-1">
          Chat with the Sicarii team about your project.
        </p>
      </div>

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessageSquare}
            title="No messages yet"
            description="Once you have an active project, you can chat directly with the Sicarii team here."
          />
        </Card>
      ) : (
        <>
          {/* Project selector */}
          {projects.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {projects.map((project) => (
                <Button
                  key={project.id}
                  variant={selectedProjectId === project.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  {project.name}
                </Button>
              ))}
            </div>
          )}

          <Card className="flex flex-col" style={{ height: "calc(100vh - 300px)" }}>
            <CardHeader className="border-b border-border">
              <CardTitle className="text-lg">
                {selectedProject?.name || "Select a project"}
              </CardTitle>
            </CardHeader>

            {/* Messages area */}
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center">
                    <MessageSquare className="h-8 w-8 text-orange/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No messages yet.</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Send one below to get started.</p>
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex flex-col max-w-[80%]",
                      message.role === "client" ? "ml-auto items-end" : "items-start"
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-3 text-sm",
                        message.role === "client"
                          ? "bg-orange text-white rounded-br-md"
                          : "bg-muted rounded-bl-md"
                      )}
                    >
                      {message.content}
                    </div>
                    <span className="mt-1 text-xs text-muted-foreground">
                      {message.role === "admin" ? "Sicarii Team" : "You"} &middot;{" "}
                      {new Date(message.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </CardContent>

            {/* Message input */}
            <div className="border-t border-border p-4">
              <form className="flex gap-2" onSubmit={handleSend}>
                <Input
                  placeholder="Type your message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit" disabled={!newMessage.trim() || sending}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
