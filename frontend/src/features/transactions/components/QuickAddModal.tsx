/**
 * QuickAddModal.tsx
 * The quick-add modal itself: a `TransactionForm` (create mode) inside a `react-bootstrap`
 * `Modal`. On success it remembers the category for next time and shows a toast; failures other
 * than field validation surface inside the form (see `TransactionForm`).
 * Exports: QuickAddModal
 * Spec: docs/spec/05a §5.4.1 (quick-add)
 */
import Modal from 'react-bootstrap/Modal';
import { useToast } from '../../../components/ToastProvider';
import { en } from '../../../i18n/en';
import { useAuth } from '../../../lib/auth/AuthContext';
import { useCreateTransactionMutation } from '../hooks';
import { setLastUsedCategory } from '../lastUsedCategory';
import { TransactionForm, type TransactionFormValues } from './TransactionForm';

interface QuickAddModalProps {
  show: boolean;
  onClose: () => void;
}

/** The quick-add-transaction modal (create-only): opened via {@link import('./QuickAddContext').useQuickAdd}. */
export function QuickAddModal({ show, onClose }: QuickAddModalProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const createMutation = useCreateTransactionMutation();

  async function handleSubmit(values: TransactionFormValues) {
    await createMutation.mutateAsync({
      type: values.type,
      amount: values.amount,
      txnDate: values.txnDate,
      description: values.description,
      categoryId: values.categoryId,
      aiSuggestedCategoryId: values.aiSuggestedCategoryId ?? null,
      aiConfidence: values.aiConfidence ?? null,
      recurring: values.repeat
        ? { frequency: values.repeat.frequency, intervalCount: values.repeat.intervalCount, endDate: values.repeat.endDate }
        : undefined,
    });
    if (user) setLastUsedCategory(user.id, values.type, values.categoryId);
    showToast({ message: en.transactions.quickAdd.success });
    onClose();
  }

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5 mb-0">
          {en.transactions.quickAdd.title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-body-secondary small">{en.transactions.quickAdd.shortcutHint}</p>
        <TransactionForm
          mode="create"
          formId="quick-add"
          autoFocusAmount
          onSubmit={handleSubmit}
          onCancel={onClose}
          submitLabel={en.transactions.quickAdd.submit}
          submittingLabel={en.transactions.quickAdd.submitting}
        />
      </Modal.Body>
    </Modal>
  );
}
