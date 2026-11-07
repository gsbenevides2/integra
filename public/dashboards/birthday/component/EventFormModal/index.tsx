import React, { useCallback, useState } from "react";

import { daysInMonth } from "@server/modules/birthday/model";
import { Button } from "@public/components/Button";
import { useConfirm } from "@public/components/Confirm";
import { Input } from "@public/components/Input";
import { Modal } from "@public/components/Modal";
import { useToast } from "@public/components/Toast";

import { getBirthdayEdenClient } from "../../client";

export interface EventFormValues {
  id?: string;
  title: string;
  month: number;
  day: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  event?: EventFormValues;
}

export function EventFormModal({ isOpen, onClose, onSaved, event }: Props) {
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();
  const confirm = useConfirm();
  const isEditing = Boolean(event?.id);

  const save = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const title = form.get("title")?.toString().trim();
      const month = Number(form.get("month"));
      const day = Number(form.get("day"));
      if (!title) return showToast("Informe o título", "error");
      if (!(month >= 1 && month <= 12)) return showToast("Mês inválido", "error");
      if (!(day >= 1 && day <= daysInMonth(month))) {
        return showToast(`Dia inválido: o mês ${month} tem no máximo ${daysInMonth(month)} dias`, "error");
      }
      const client = getBirthdayEdenClient().api.birthday;
      const body = { title, month, day };
      setIsSaving(true);
      try {
        const { error } = event?.id
          ? await client({ id: event.id }).patch(body)
          : await client.post(body);
        if (error) return showToast("Falha ao salvar evento", "error");
        showToast(isEditing ? "Evento atualizado" : "Evento criado", "success");
        onSaved();
        onClose();
      } finally {
        setIsSaving(false);
      }
    },
    [event?.id, isEditing, onClose, onSaved, showToast],
  );

  const remove = useCallback(async () => {
    if (!event?.id) return;
    const ok = await confirm({
      message: "Tem certeza que deseja deletar este evento?",
      confirmLabel: "Deletar",
    });
    if (!ok) return;
    setIsSaving(true);
    const { error } = await getBirthdayEdenClient().api.birthday({ id: event.id }).delete();
    setIsSaving(false);
    if (error) return showToast("Falha ao deletar evento", "error");
    showToast("Evento deletado", "success");
    onSaved();
    onClose();
  }, [confirm, event?.id, onClose, onSaved, showToast]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Editar evento" : "Criar evento"}>
      <form className="flex flex-col gap-3" onSubmit={save} key={event?.id ?? `new-${event?.month}-${event?.day}`}>
        <Input label="Título" id="title" placeholder="Ex: Aniversário de João" defaultValue={event?.title} />
        <div className="grid grid-cols-2 gap-2">
          <Input label="Dia" id="day" type="number" min={1} max={31} defaultValue={event?.day} />
          <Input label="Mês" id="month" type="number" min={1} max={12} defaultValue={event?.month} />
        </div>
        <p className="text-xs text-mist-400">
          Apenas dia e mês são salvos (o evento se repete todo ano).
        </p>
        <div className="mt-1 flex justify-end gap-2">
          {isEditing && (
            <Button type="button" variant="secondary" onClick={remove} disabled={isSaving} className="
              mr-auto text-red-400
            ">
              Deletar
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={isSaving}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
