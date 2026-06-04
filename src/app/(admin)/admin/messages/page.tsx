"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send } from "lucide-react";
import { cn } from "@/lib/utils";

const conversations = [
  { id: "1", client: "John Doe", project: "E-commerce Platform", unread: 2, lastMessage: "I uploaded the brand guide..." },
  { id: "2", client: "Jane Smith", project: "Lead Gen Funnel", unread: 0, lastMessage: "Looks great! Let me know..." },
  { id: "3", client: "Mike Chen", project: "Open Claw Setup", unread: 1, lastMessage: "When will testing begin?" },
];

const demoMessages = [
  { id: "1", content: "Hey! I uploaded the brand guide and logo files.", role: "client" as const, name: "John Doe", time: "10:00 AM" },
  { id: "2", content: "Perfect, I'll review them today. The wireframes are looking good.", role: "admin" as const, name: "You", time: "10:15 AM" },
  { id: "3", content: "Awesome! Can we also add a wishlist feature to the store?", role: "client" as const, name: "John Doe", time: "10:30 AM" },
  { id: "4", content: "I uploaded the brand guide and product photos to the project.", role: "client" as const, name: "John Doe", time: "11:00 AM" },
];

export default function AdminMessagesPage() {
  const [selectedConvo, setSelectedConvo] = useState(conversations[0]);
  const [newMessage, setNewMessage] = useState("");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Messages</h1>
        <p className="text-muted-foreground mt-1">Communicate with clients.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" style={{ height: "calc(100vh - 250px)" }}>
        {/* Conversation list */}
        <Card className="lg:col-span-1 overflow-hidden">
          <CardHeader className="border-b border-border py-4">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-orange" />
              Conversations
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto">
            {conversations.map((convo) => (
              <button
                key={convo.id}
                onClick={() => setSelectedConvo(convo)}
                className={cn(
                  "w-full text-left p-4 border-b border-border transition-colors cursor-pointer",
                  selectedConvo.id === convo.id
                    ? "bg-orange/5 border-l-2 border-l-orange"
                    : "hover:bg-muted/50"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{convo.client}</span>
                  {convo.unread > 0 && (
                    <Badge variant="default" className="text-xs h-5 w-5 p-0 flex items-center justify-center rounded-full">
                      {convo.unread}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{convo.project}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">{convo.lastMessage}</p>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Chat area */}
        <Card className="lg:col-span-2 flex flex-col overflow-hidden">
          <CardHeader className="border-b border-border py-4">
            <CardTitle className="text-base">
              {selectedConvo.client} — {selectedConvo.project}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {demoMessages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col max-w-[80%]",
                  msg.role === "admin" ? "ml-auto items-end" : "items-start"
                )}
              >
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3 text-sm",
                    msg.role === "admin"
                      ? "bg-orange text-white rounded-br-md"
                      : "bg-muted rounded-bl-md"
                  )}
                >
                  {msg.content}
                </div>
                <span className="mt-1 text-xs text-muted-foreground">
                  {msg.name} &middot; {msg.time}
                </span>
              </div>
            ))}
          </CardContent>
          <div className="border-t border-border p-4">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (newMessage.trim()) setNewMessage("");
              }}
            >
              <Input
                placeholder="Type your message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={!newMessage.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
}
