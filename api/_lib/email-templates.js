export function buildAccessConfirmationEmail({ locale = 'en', fullName, email, role }) {
  const greeting = fullName ? fullName : email;
  if (locale === 'ar') {
    return {
      subject: 'تم استلام طلب الوصول إلى VOXRELAY',
      textBody: `مرحباً ${greeting}،\n\nتم استلام طلب الوصول الخاص بك (${role}). سيقوم فريق المراجعة بمراجعته وإرسال رابط دعوة عند الموافقة.\n\nفريق VOXRELAY`,
      htmlBody: `<div dir="rtl" style="font-family:sans-serif;line-height:1.7;color:#17171a"><h2>تم استلام طلب الوصول</h2><p>مرحباً ${escapeHtml(greeting)}،</p><p>تم تسجيل طلبك في طابور المراجعة (${escapeHtml(role)}). عند الموافقة سيصلك رابط دعوة لمرة واحدة.</p><p>VOXRELAY</p></div>`,
    };
  }
  return {
    subject: 'VOXRELAY access request received',
    textBody: `Hello ${greeting},\n\nYour VOXRELAY access request (${role}) has been recorded in our review queue. Once approved, you will receive a one-time invite link.\n\n— VOXRELAY`,
    htmlBody: `<div style="font-family:sans-serif;line-height:1.6;color:#17171a"><h2>Access request received</h2><p>Hello ${escapeHtml(greeting)},</p><p>Your VOXRELAY access request (${escapeHtml(role)}) has been recorded. Once reviewed, you will receive a one-time workspace invite.</p><p>— VOXRELAY</p></div>`,
  };
}

export function buildInviteEmail({ locale = 'en', fullName, inviteUrl, role }) {
  const greeting = fullName || 'Interpreter';
  if (locale === 'ar') {
    return {
      subject: 'دعوتك للانضمام إلى مساحة عمل VOXRELAY',
      textBody: `مرحباً ${greeting}،\n\nتمت الموافقة على طلبك (${role}). افتح الرابط التالي لإعداد حسابك (صالح لمرة واحدة لمدة 7 أيام):\n${inviteUrl}`,
      htmlBody: `<div dir="rtl" style="font-family:sans-serif;line-height:1.7;color:#17171a"><h2>تمت الموافقة على طلبك</h2><p>مرحباً ${escapeHtml(greeting)}،</p><p>استخدم هذا الرابط لمرة واحدة لإنشاء حسابك (${escapeHtml(role)}):</p><p><a href="${escapeHtml(inviteUrl)}">${escapeHtml(inviteUrl)}</a></p></div>`,
    };
  }
  return {
    subject: 'Your VOXRELAY workspace invite',
    textBody: `Hello ${greeting},\n\nYour VOXRELAY access request (${role}) was approved. Use this one-time link (valid for 7 days) to activate your account:\n${inviteUrl}\n\n— VOXRELAY`,
    htmlBody: `<div style="font-family:sans-serif;line-height:1.6;color:#17171a"><h2>Your VOXRELAY invite is ready</h2><p>Hello ${escapeHtml(greeting)},</p><p>Your access request (${escapeHtml(role)}) was approved. Use this one-time link to activate your account:</p><p><a href="${escapeHtml(inviteUrl)}">${escapeHtml(inviteUrl)}</a></p></div>`,
  };
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
