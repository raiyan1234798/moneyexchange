import { useCallback, useState } from "react";
import { toast } from "sonner";
import { getFirestoreErrorMessage, isFirestoreIndexError } from "@/lib/firebase/firestore-errors";

export function useFirestoreNotice(label: string) {
  const [notice, setNotice] = useState<string | null>(null);

  const onError = useCallback(
    (error: Error) => {
      const message = getFirestoreErrorMessage(error, `Failed to load ${label}`);
      if (isFirestoreIndexError(error)) setNotice(message);
      toast.error(message);
    },
    [label],
  );

  const clearNotice = useCallback(() => setNotice(null), []);

  return { notice, onError, clearNotice };
}
