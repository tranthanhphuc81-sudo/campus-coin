/**
 * TipTemplateFormModal.tsx
 * Create/edit modal for a tip template: `code`/`ruleType` (immutable, create-only), `titleTpl`/
 * `bodyTpl` textareas with placeholder helper text, an `isActive` checkbox, and a "Preview" button
 * that renders the in-progress template against fixed sample data via `POST /admin/tip-templates/preview`
 * (called on-demand, never on every keystroke).
 * Exports: TipTemplateFormModal
 * Spec: docs/spec/05b §5.10 (Bảng 23/35) · docs/spec/05c §5.13
 */
import { TIP_TEMPLATE_BODY_MAX_LENGTH, TIP_TEMPLATE_TITLE_MAX_LENGTH, TipRuleType, noHtmlSchema, tipTemplateCodeSchema, type TipTemplateDto } from '@campuscoin/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import Modal from 'react-bootstrap/Modal';
import Spinner from 'react-bootstrap/Spinner';
import { z } from 'zod';
import { en } from '../../../i18n/en';
import { applyFieldErrors, type ApiError } from '../../../lib/apiClient/apiError';
import { useCreateAdminTipTemplateMutation, usePreviewAdminTipTemplateMutation, useUpdateAdminTipTemplateMutation } from '../hooks';

/** Every `{...}` placeholder in a template string — mirrors `tipTemplate.ts`'s private matcher. */
const PLACEHOLDER = /\{[^}]*\}/g;
const ALLOWED_PLACEHOLDERS = new Set(['category', 'amount', 'percent']);

/** True when every `{...}` placeholder in `value` is exactly one of the 3 allowed names. */
function hasOnlyAllowedPlaceholders(value: string): boolean {
  const matches = value.match(PLACEHOLDER) ?? [];
  return matches.every((m) => ALLOWED_PLACEHOLDERS.has(m.slice(1, -1)));
}

/** Client-side mirror of the server's template-field rules (trim, length, no HTML, allowed placeholders). */
function templateFieldSchema(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1, 'This field is required.')
    .max(maxLength, `Must be at most ${maxLength} characters.`)
    .pipe(noHtmlSchema)
    .refine(hasOnlyAllowedPlaceholders, 'Only {category}, {amount} and {percent} placeholders are allowed.');
}

const formSchema = z.object({
  code: tipTemplateCodeSchema,
  ruleType: z.enum(TipRuleType),
  titleTpl: templateFieldSchema(TIP_TEMPLATE_TITLE_MAX_LENGTH),
  bodyTpl: templateFieldSchema(TIP_TEMPLATE_BODY_MAX_LENGTH),
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface TipTemplateFormModalProps {
  show: boolean;
  onClose: () => void;
  template?: TipTemplateDto;
}

/** Create/edit modal for a savings-tip template, with an on-demand sample-data preview. */
export function TipTemplateFormModal({ show, onClose, template }: TipTemplateFormModalProps) {
  const t = en.adminTipTemplates.form;
  const isEdit = template !== undefined;
  const [serverError, setServerError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; body: string } | null>(null);
  const createMutation = useCreateAdminTipTemplateMutation();
  const updateMutation = useUpdateAdminTipTemplateMutation();
  const previewMutation = usePreviewAdminTipTemplateMutation();

  const {
    register,
    handleSubmit,
    getValues,
    trigger,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: {
      code: template?.code ?? '',
      ruleType: template?.ruleType ?? TipRuleType.GENERAL,
      titleTpl: template?.titleTpl ?? '',
      bodyTpl: template?.bodyTpl ?? '',
      isActive: template?.isActive ?? true,
    },
  });

  function handleClose() {
    setServerError(null);
    setPreview(null);
    onClose();
  }

  async function handlePreview() {
    setPreview(null);
    const valid = await trigger(['titleTpl', 'bodyTpl']);
    if (!valid) return;
    const { titleTpl, bodyTpl } = getValues();
    try {
      const result = await previewMutation.mutateAsync({ titleTpl, bodyTpl });
      setPreview(result);
    } catch {
      setPreview(null);
      setServerError(t.previewError);
    }
  }

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: template.id,
          input: { titleTpl: values.titleTpl, bodyTpl: values.bodyTpl, isActive: values.isActive },
        });
      } else {
        await createMutation.mutateAsync({
          code: values.code,
          ruleType: values.ruleType,
          titleTpl: values.titleTpl,
          bodyTpl: values.bodyTpl,
          isActive: values.isActive,
        });
      }
      reset();
      handleClose();
    } catch (err) {
      const error = err as ApiError;
      applyFieldErrors(setError, error);
      if (Object.keys(error.fieldErrors).length === 0) {
        setServerError(error.status === 409 ? t.duplicateCode : error.detail ?? error.title ?? en.errors.generic);
      }
    }
  }

  return (
    <Modal show={show} onHide={handleClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5 mb-0">
          {isEdit ? t.editTitle : t.createTitle}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {serverError ? (
          <div className="alert alert-danger" role="alert">
            {serverError}
          </div>
        ) : null}
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="row">
            <div className="col-sm-7 mb-3">
              <label htmlFor="tip-template-code" className="form-label">
                {t.code}
              </label>
              <input
                id="tip-template-code"
                type="text"
                className={`form-control ${errors.code ? 'is-invalid' : ''}`}
                disabled={isEdit}
                aria-describedby="tip-template-code-hint"
                {...register('code')}
              />
              <div id="tip-template-code-hint" className="form-text">
                {t.codeHint}
              </div>
              {errors.code ? <div className="invalid-feedback d-block">{errors.code.message}</div> : null}
            </div>
            <div className="col-sm-5 mb-3">
              <label htmlFor="tip-template-rule-type" className="form-label">
                {t.ruleType}
              </label>
              <select id="tip-template-rule-type" className="form-select" disabled={isEdit} aria-describedby="tip-template-rule-type-hint" {...register('ruleType')}>
                {Object.values(TipRuleType).map((rule) => (
                  <option key={rule} value={rule}>
                    {en.adminTipTemplates.ruleTypeLabels[rule]}
                  </option>
                ))}
              </select>
              <div id="tip-template-rule-type-hint" className="form-text">
                {t.ruleTypeHint}
              </div>
            </div>
          </div>

          <div className="mb-3">
            <label htmlFor="tip-template-title" className="form-label">
              {t.titleTpl}
            </label>
            <textarea
              id="tip-template-title"
              rows={2}
              className={`form-control ${errors.titleTpl ? 'is-invalid' : ''}`}
              aria-describedby="tip-template-title-hint"
              {...register('titleTpl')}
            />
            <div id="tip-template-title-hint" className="form-text">
              {t.placeholderHint}
            </div>
            {errors.titleTpl ? <div className="invalid-feedback d-block">{errors.titleTpl.message}</div> : null}
          </div>

          <div className="mb-3">
            <label htmlFor="tip-template-body" className="form-label">
              {t.bodyTpl}
            </label>
            <textarea
              id="tip-template-body"
              rows={3}
              className={`form-control ${errors.bodyTpl ? 'is-invalid' : ''}`}
              aria-describedby="tip-template-body-hint"
              {...register('bodyTpl')}
            />
            <div id="tip-template-body-hint" className="form-text">
              {t.placeholderHint}
            </div>
            {errors.bodyTpl ? <div className="invalid-feedback d-block">{errors.bodyTpl.message}</div> : null}
          </div>

          <div className="form-check mb-3">
            <input id="tip-template-is-active" type="checkbox" className="form-check-input" {...register('isActive')} />
            <label htmlFor="tip-template-is-active" className="form-check-label">
              {t.isActive}
            </label>
          </div>

          <div className="mb-3">
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={previewMutation.isPending} onClick={() => void handlePreview()}>
              {previewMutation.isPending ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />
                  {t.previewing}
                </>
              ) : (
                t.preview
              )}
            </button>
            {preview ? (
              <div className="border rounded p-3 mt-2" role="status">
                <p className="small text-body-secondary mb-2">{t.previewTitle}</p>
                <p className="fw-semibold mb-1">
                  {t.previewTitleLabel}: {preview.title}
                </p>
                <p className="mb-0">
                  {t.previewBodyLabel}: {preview.body}
                </p>
              </div>
            ) : null}
          </div>

          <div className="d-flex gap-2 justify-content-end">
            <button type="button" className="btn btn-outline-secondary" onClick={handleClose}>
              {en.common.cancel}
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />
                  {isEdit ? t.saving : t.creating}
                </>
              ) : isEdit ? (
                t.save
              ) : (
                t.create
              )}
            </button>
          </div>
        </form>
      </Modal.Body>
    </Modal>
  );
}
