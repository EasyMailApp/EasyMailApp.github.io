// background.js

const GEMINI_MODEL = 'gemini-3.6-flash';

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("jobRunner", {
    periodInMinutes: 1
  });
  
  // Initialize app state
  chrome.storage.local.get(['appState'], (data) => {
    if (!data.appState) {
      chrome.storage.local.set({ appState: { isRunning: false } });
    }
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "jobRunner") {
    await processNextJob();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "sendEmail") {
    handleSendEmail(request.jobId)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ error: error.message }));
    return true; // Keep message channel open for async response
  }
  if (request.action === "generateEmail") {
    handleGenerateEmail(request.jobId)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  if (request.action === "runQueue") {
    processNextJob();
    sendResponse({ success: true });
    return true;
  }
});

async function processNextJob() {
  const data = await chrome.storage.local.get(['appState', 'jobs', 'notificationsEnabled']);
  if (!data.appState || !data.appState.isRunning) return;

  const jobs = data.jobs || [];
  const nextJobIndex = jobs.findIndex(j => j.status === 'pending');
  
  if (nextJobIndex === -1) {
    // No pending jobs, auto pause
    await chrome.storage.local.set({ appState: { isRunning: false } });
    if (data.notificationsEnabled !== false) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        title: 'Auto-Processor Finished',
        message: 'All pending jobs have been successfully processed and emails sent!'
      });
    }
    return;
  }
  
  const job = jobs[nextJobIndex];
  
  try {
    // Mark as processing temporarily to avoid duplicate runs
    job.status = 'processing';
    jobs[nextJobIndex] = job;
    await chrome.storage.local.set({ jobs });

    // Generate if not generated
    if (!job.generatedEmail) {
      await handleGenerateEmail(job.id);
    }
    
    // Send email
    await handleSendEmail(job.id);

    // Notification
    if (data.notificationsEnabled !== false) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        title: 'Application Sent!',
        message: `Successfully applied to ${job.role} at ${job.company}.`
      });
    }
  } catch (error) {
    console.error("Background processing failed for job " + job.id, error);
    // Reload jobs from storage to mark as failed
    const latestData = await chrome.storage.local.get(['jobs']);
    const latestJobs = latestData.jobs || [];
    const idx = latestJobs.findIndex(j => j.id === job.id);
    if (idx !== -1) {
      latestJobs[idx].status = 'failed';
      await chrome.storage.local.set({ jobs: latestJobs });
    }
  }
}

async function handleGenerateEmail(jobId) {
  const data = await chrome.storage.local.get(['jobs', 'geminiKey', 'profile']);
  const jobs = data.jobs || [];
  const jobIndex = jobs.findIndex(j => j.id === jobId);
  const job = jobs[jobIndex];

  if (!job) throw new Error("Job not found");
  if (!data.geminiKey) throw new Error('Please set Gemini API Key in Settings');

  let profileText = '';
  if (data.profile) {
    const p = data.profile;
    profileText += `\n\n=== CANDIDATE PROFILE ===\n`;
    if (p.name) profileText += `Name: ${p.name}\n`;
    if (p.role) profileText += `Role/Designation: ${p.role}\n`;
    if (p.phone && p.phoneCb !== false) profileText += `Phone: ${p.phone}\n`;
    if (p.email && p.emailCb !== false) profileText += `Email: ${p.email}\n`;
    if (p.github && p.githubCb !== false) profileText += `GitHub: ${p.github}\n`;
    if (p.linkedin && p.linkedinCb !== false) profileText += `LinkedIn: ${p.linkedin}\n`;
    if (p.portfolio && p.portfolioCb !== false) profileText += `Portfolio: ${p.portfolio}\n`;
    
    if (p.projects && p.projectsCb !== false) {
      profileText += `Past Projects:\n`;
      p.projects.split('\n').forEach(url => {
        if (url.trim()) profileText += `${url.trim()}\n`;
      });
    }
  }

  const salutation = (data.profile && data.profile.salutation) || 'Dear Hiring Team,';
  const promptText = `Write a highly concise job application email based on the following job post and candidate profile.

STRICT TEMPLATE TO FOLLOW:
${salutation}

I am applying for the [Role from job post] position.

I have experience in [Summarize relevant skills matching the job post]. I focus on [Main goal/value proposition based on job post].

Here are some of my recent projects:
[List the candidate's Past Projects here exactly as provided in the profile. ONE URL PER LINE. Do NOT use bullet points or asterisks. Just the raw links.]

I am confident in my ability to contribute effectively as a [Role] expert.

I would love to discuss this opportunity further.

Thanks & regards,
[Candidate Name]
[If provided in profile: 📞 Phone]
[If provided in profile: 📧 Email]
[If provided in profile: 🔗 LinkedIn]
[If provided in profile: <img src="https://cdn-icons-png.flaticon.com/512/25/25231.png" width="14" height="14" alt="GitHub" style="vertical-align: middle;"> GitHub]
[If provided in profile: 🌐 Portfolio]

IMPORTANT: Do not add extra fluff, introductory, or concluding paragraphs. Keep it exactly as concise as the template. Do NOT use bullet points for the project links. We will be sending this as an HTML email, so if you see HTML tags like <img>, preserve them exactly.

=== JOB POST ===
${job.text}
${profileText}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${data.geminiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: promptText
        }]
      }]
    })
  });

  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'API Error');

  const generatedText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!generatedText) {
    throw new Error('Gemini returned an empty response. Please try again.');
  }
  
  // Reload jobs to avoid overwriting changes from other processes
  const latestData = await chrome.storage.local.get(['jobs']);
  const latestJobs = latestData.jobs || [];
  const latestIndex = latestJobs.findIndex(j => j.id === jobId);
  if (latestIndex !== -1) {
    latestJobs[latestIndex].generatedEmail = generatedText;
    latestJobs[latestIndex].status = 'generated';
    await chrome.storage.local.set({ jobs: latestJobs });
  }
}

async function handleSendEmail(jobId) {
  const data = await chrome.storage.local.get(['jobs', 'resumeData', 'resumeName']);
  const jobs = data.jobs || [];
  const jobIndex = jobs.findIndex(j => j.id === jobId);
  const job = jobs[jobIndex];

  if (!job) throw new Error("Job not found");
  if (!job.emails || job.emails.length === 0) throw new Error("No recipient emails found");

  // Get Auth Token
  const token = await new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(token);
    });
  });

  const boundary = "foo_bar_baz";
  const to = job.emails.join(', ');
  const subject = `Application for ${job.role}`;
  const messageText = job.generatedEmail;
  
  let emailLines = [];
  emailLines.push(`To: ${to}`);
  emailLines.push(`Subject: ${subject}`);
  emailLines.push('MIME-Version: 1.0');
  emailLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  emailLines.push('');
  emailLines.push(`--${boundary}`);
  emailLines.push('Content-Type: text/html; charset="UTF-8"');
  emailLines.push('');
  
  // Convert newlines to <br> for HTML email, but keep the raw string intact
  const htmlMessage = messageText.replace(/\n/g, '<br>');
  emailLines.push(htmlMessage);
  emailLines.push('');

  if (data.resumeData && data.resumeName) {
    emailLines.push(`--${boundary}`);
    emailLines.push(`Content-Type: application/pdf; name="${data.resumeName}"`);
    emailLines.push('Content-Transfer-Encoding: base64');
    emailLines.push(`Content-Disposition: attachment; filename="${data.resumeName}"`);
    emailLines.push('');
    // Split base64 into lines of 76 chars to adhere to RFC 2045
    const base64Str = data.resumeData;
    for (let i = 0; i < base64Str.length; i += 76) {
      emailLines.push(base64Str.slice(i, i + 76));
    }
    emailLines.push('');
  }

  emailLines.push(`--${boundary}--`);

  const rawEmail = emailLines.join('\r\n');
  const encodedEmail = btoa(unescape(encodeURIComponent(rawEmail)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, ''); // URL-safe base64 encoding for Gmail API

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      raw: encodedEmail
    })
  });

  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Failed to send email");

  // Reload jobs and update status
  const latestData = await chrome.storage.local.get(['jobs']);
  const latestJobs = latestData.jobs || [];
  const latestIndex = latestJobs.findIndex(j => j.id === jobId);
  if (latestIndex !== -1) {
    latestJobs[latestIndex].status = 'sent';
    await chrome.storage.local.set({ jobs: latestJobs });
  }
}
