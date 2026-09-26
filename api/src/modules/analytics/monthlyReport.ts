import { renderMonthlyReport } from "../../integrations/pdf/renderMonthlyReport.js";
import { sendMail } from "../../integrations/mailer.js";
import { findUserGreetingName } from "./repository.js";

export { renderMonthlyReport };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function shareMonthlyReport(params: {
  userId: string;
  month: string;
  toEmail: string;
}): Promise<void> {
  const [fullName, pdfBuffer] = await Promise.all([
    findUserGreetingName(params.userId),
    renderMonthlyReport(params.userId, params.month),
  ]);

  const safeName = escapeHtml(fullName);

  // No public link to the data is included in the email body (design 5.8 / 9.10).
  await sendMail({
    to: params.toEmail,
    subject: `Campus Coin monthly report - ${params.month}`,
    text: `Hi ${fullName},\n\nAttached is your Campus Coin spending report for ${params.month}. This report contains your personal financial data, so please keep this email and its attachment private.\n\nThis report is for reference only and is not financial advice.\n\n- Campus Coin`,
    html: `<p>Hi ${safeName},</p><p>Attached is your Campus Coin spending report for <strong>${params.month}</strong>. This report contains your personal financial data, so please keep this email and its attachment private.</p><p><em>This report is for reference only and is not financial advice.</em></p><p>&ndash; Campus Coin</p>`,
    attachments: [
      {
        filename: `campus-coin-report-${params.month}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}
