import nodemailer from 'nodemailer'
import dotenv from 'dotenv'
dotenv.config()

// 建立寄信 transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true, // 465 要設為 true
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

/**
 * 寄送 Email
 * @param {string} to 收件者 Email
 * @param {string} subject 主旨
 * @param {string} html 內文（可用 HTML）
 */
export async function sendEmail(to, subject, html) {
  try {
    const info = await transporter.sendMail({
      from: `"Portfolio Alert" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    })
    console.log('Email 已發送:', info.messageId)
  } catch (err) {
    console.error('Email 發送失敗:', err)
  }
}
