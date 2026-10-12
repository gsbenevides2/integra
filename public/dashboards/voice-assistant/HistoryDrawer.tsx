import React, { useCallback, useEffect, useState } from "react";

import { useConfirm } from "@public/components/ConfirmContext";
import { Drawer } from "@public/components/Drawer";
import { IconButton } from "@public/components/IconButton";
import { useToast } from "@public/components/Toast";
import { useVoiceAssistant } from "@public/components/VoiceAssistantContext";

import { ChatBubbleLeftRightIcon, TrashIcon } from "@heroicons/react/24/outline";

import { getAssistantEdenClient } from "./client";

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string | Date;
  ended: boolean;
}

const DATE_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/** The user's past conversations: open one to continue it, or delete it. */
export function HistoryDrawer({ isOpen, onClose }: Props) {
  const assistant = useVoiceAssistant();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await getAssistantEdenClient().api.assistant.conversations.get();
    setIsLoading(false);
    if (error || !data) {
      showToast("Falha ao carregar o histórico", "error");
      return;
    }
    setConversations(data);
  }, [showToast]);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  const open = (id: string) => {
    onClose();
    void assistant.openConversation(id);
  };

  const remove = async (conversation: ConversationSummary) => {
    const ok = await confirm({
      title: "Excluir conversa",
      message: `Excluir "${conversation.title}" e as imagens dela? Não dá para desfazer.`,
      confirmLabel: "Excluir",
    });
    if (!ok) return;
    const { error } = await getAssistantEdenClient()
      .api.assistant.conversations({ id: conversation.id })
      .delete();
    if (error) {
      showToast("Falha ao excluir a conversa", "error");
      return;
    }
    if (assistant.conversationId === conversation.id) await assistant.reset();
    setConversations((prev) => prev.filter((c) => c.id !== conversation.id));
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Histórico" direction="right" size="small">
      {isLoading && conversations.length === 0 ? (
        <p className="text-sm text-mist-400">Carregando...</p>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <ChatBubbleLeftRightIcon className="size-8 text-mist-500" />
          <p className="text-sm text-mist-300">Nenhuma conversa ainda</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {conversations.map((conversation) => (
            <li
              key={conversation.id}
              className={`
                flex items-center gap-2 rounded-md
                ${assistant.conversationId === conversation.id ? "bg-mist-900" : `
                  hover:bg-gray-800
                `}
              `}
            >
              <button
                type="button"
                onClick={() => open(conversation.id)}
                className="min-w-0 flex-1 cursor-pointer px-3 py-2 text-left"
              >
                <p className="truncate text-sm text-mist-100">{conversation.title}</p>
                <p className="text-[11px] text-mist-400">
                  {DATE_FORMAT.format(new Date(conversation.updatedAt))}
                </p>
              </button>
              <IconButton
                onClick={() => void remove(conversation)}
                aria-label={`Excluir ${conversation.title}`}
              >
                <TrashIcon className="size-4 text-mist-400" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
