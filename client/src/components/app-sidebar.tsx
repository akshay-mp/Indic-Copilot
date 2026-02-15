import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Sparkles, LayoutGrid, Leaf, MessageSquare, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation } from "@shared/schema";

interface AppSidebarProps {
  activePage: string;
  activeConversationId: number | null;
  onNavigate: (page: string) => void;
  onSelectConversation: (id: number) => void;
  onNewConversation: () => void;
}

export function AppSidebar({
  activePage,
  activeConversationId,
  onNavigate,
  onSelectConversation,
  onNewConversation,
}: AppSidebarProps) {
  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/conversations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    },
  });

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">VoiceForge</h1>
            <p className="text-xs text-muted-foreground">AI App Builder</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => onNavigate("dashboard")}
                  isActive={activePage === "dashboard"}
                  data-testid="nav-dashboard"
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span>My Apps</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => onNavigate("plant-doctor")}
                  isActive={activePage === "plant-doctor"}
                  data-testid="nav-plant-doctor"
                >
                  <Leaf className="w-4 h-4" />
                  <span>Plant Doctor</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between gap-1 pr-2">
            <span>Conversations</span>
            <Button
              size="icon"
              variant="ghost"
              className="w-6 h-6"
              onClick={onNewConversation}
              data-testid="button-new-conversation"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {conversations && conversations.length > 0 ? (
                conversations.map((conv) => (
                  <SidebarMenuItem key={conv.id}>
                    <SidebarMenuButton
                      onClick={() => onSelectConversation(conv.id)}
                      isActive={activePage === "builder" && activeConversationId === conv.id}
                      className="group/item"
                      data-testid={`nav-conversation-${conv.id}`}
                    >
                      <MessageSquare className="w-4 h-4 shrink-0" />
                      <span className="truncate">{conv.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              ) : (
                <div className="px-3 py-2">
                  <p className="text-xs text-muted-foreground">No conversations yet</p>
                </div>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3">
        <Button
          variant="outline"
          className="w-full"
          onClick={onNewConversation}
          data-testid="button-start-building"
        >
          <Plus className="w-4 h-4 mr-2" />
          New App
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
