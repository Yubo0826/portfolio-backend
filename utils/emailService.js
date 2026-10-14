import { Resend } from 'resend'
import dotenv from 'dotenv'

dotenv.config()

// 初始化 Resend
const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * 寄送 Email (Resend)
 * @param {string} to 收件者 email
 * @param {string} subject 主旨
 * @param {string} html 內文（可用 HTML）
 * @returns {Promise<boolean>} 是否寄送成功
 */
export async function sendEmail(to, subject, html) {
  try {
    console.log("Sending email via Resend...")

    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM,     // 這裡一定要用 domain 驗證過的 Email
      to: to,
      subject: subject,
      html: html,
    })

    // Resend 失敗時不 throw，而是回傳 { error }
    if (result?.error) {
      console.error("Email 發送失敗:", result.error)
      return false
    }
    console.log("Email 已發送:", result?.data?.id)
    return true
  } catch (err) {
    console.error("Email 發送失敗:", err)
    return false
  }
}
