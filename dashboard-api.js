(() => {
  const request = window.SnippetAuth.request;
  const toast = (title, message) => {
    const node = document.getElementById('dashboardToast');
    if (!node) return;
    node.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = title;
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    node.append(strong, paragraph);
    node.classList.add('show');
    window.setTimeout(() => node.classList.remove('show'), 2600);
  };

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  }

  function renderUploads(items) {
    const list = document.getElementById('recentUploadsList');
    if (!list) return;
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'upload-empty';
      empty.textContent = 'Your published templates will appear here.';
      list.append(empty);
      return;
    }

    items.forEach((template) => {
      const row = document.createElement('div');
      row.className = 'upload-item';
      const icon = document.createElement('span');
      icon.className = `upload-icon ${template.category}`;
      icon.textContent = template.category.slice(0, 1).toUpperCase();
      const info = document.createElement('span');
      info.className = 'upload-info';
      const title = document.createElement('strong');
      title.textContent = template.title;
      const description = document.createElement('small');
      description.textContent = template.category;
      info.append(title, description);
      const time = document.createElement('span');
      time.className = 'upload-time';
      time.textContent = new Date(template.createdAt).toLocaleDateString();
      row.append(icon, info, time);
      list.append(row);
    });
  }

  function renderCategoryChart(counts, total) {
    const categories = Object.entries(counts).sort((left, right) => right[1] - left[1]).slice(0, 7);
    const bars = document.getElementById('chartBars');
    const labels = document.querySelector('.chart-labels');
    const max = Math.max(1, ...categories.map((entry) => entry[1]));
    if (bars) {
      bars.replaceChildren();
      categories.forEach(([, count]) => {
        const bar = document.createElement('span');
        bar.style.height = `${Math.max(8, Math.round((count / max) * 100))}%`;
        bars.append(bar);
      });
    }
    if (labels) {
      labels.replaceChildren();
      categories.forEach(([category]) => {
        const label = document.createElement('span');
        label.textContent = category;
        labels.append(label);
      });
    }
    setText('chartTotal', total);
    const summary = document.querySelector('.chart-summary span');
    if (summary) summary.textContent = 'templates by category';

    const breakdown = document.getElementById('categoryBreakdown');
    if (breakdown) {
      breakdown.replaceChildren();
      categories.forEach(([category, count], index) => {
        const row = document.createElement('div');
        row.className = 'team-project';
        const dot = document.createElement('span');
        dot.className = `project-dot ${['blue', 'purple', 'green'][index % 3]}`;
        const info = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = category;
        const amount = document.createElement('small');
        amount.textContent = `${count} ${count === 1 ? 'template' : 'templates'}`;
        info.append(name, amount);
        const progress = document.createElement('div');
        progress.className = 'team-progress';
        const fill = document.createElement('span');
        fill.style.width = `${Math.max(8, Math.round((count / max) * 100))}%`;
        progress.append(fill);
        row.append(dot, info, progress);
        breakdown.append(row);
      });
    }
  }

  async function loadDashboard() {
    try {
      const data = await request('/api/dashboard');
      const heading = document.querySelector('.welcome-row h2');
      if (heading?.firstChild) heading.firstChild.textContent = `Welcome back, ${data.user.name}. `;
      const accountName = document.querySelector('.sidebar-user .user-details strong');
      const accountEmail = document.querySelector('.sidebar-user .user-details small');
      const avatar = document.querySelector('.sidebar-user .avatar');
      if (accountName) accountName.textContent = data.user.name;
      if (accountEmail) accountEmail.textContent = data.user.email;
      if (avatar) avatar.textContent = data.user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
      setText('activeProjectsValue', data.stats.templates);
      setText('downloadsValue', data.stats.communityTemplates);
      setText('engagementValue', data.stats.following);
      setText('revenueValue', data.stats.reviews);
      renderUploads(data.recentTemplates);
      renderCategoryChart(data.categoryCounts, data.stats.communityTemplates);
    } catch (error) {
      toast('Dashboard unavailable', error.message);
    }
  }

  async function exportTemplates() {
    try {
      const [identity, result] = await Promise.all([request('/api/auth/me'), request('/api/templates')]);
      const templates = result.templates.filter((template) => template.authorId === identity.user.id);
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), templates }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'snippet-studio-templates.json';
      link.click();
      URL.revokeObjectURL(url);
      toast('Export complete', `${templates.length} account templates exported.`);
    } catch (error) {
      toast('Export failed', error.message);
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('#publishButton, #viewAllUploads, [data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (button.id === 'publishButton' || button.id === 'viewAllUploads' || action === 'new-template' || action === 'new-project') {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign('/html.html#serverPublishTemplateForm');
      return;
    }
    if (action === 'export-pack' || action === 'export') {
      event.preventDefault();
      event.stopImmediatePropagation();
      exportTemplates();
      return;
    }
    if (action === 'invite-team') {
      event.preventDefault();
      event.stopImmediatePropagation();
      toast('Invites not configured', 'Add an email delivery provider to send team invitations.');
    }
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    if (window.EventSource) {
      const eventStream = new EventSource('/api/events');
      eventStream.addEventListener('template-published', loadDashboard);
      eventStream.addEventListener('template-updated', loadDashboard);
      eventStream.addEventListener('template-deleted', loadDashboard);
      window.addEventListener('pagehide', () => eventStream.close(), { once: true });
    }
  });
})();
