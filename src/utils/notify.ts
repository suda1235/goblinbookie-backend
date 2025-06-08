import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

export async function sendEmailNotification(subject: string, body: string) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_FROM,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    subject,
    text: body,
  });
}
