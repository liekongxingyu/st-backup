import {
    extension_settings,
    saveSettingsDebounced,
    renderExtensionTemplateAsync,
} from '../../../extensions.js';

const PLUGIN_NAME = 'st-git-backup';
const DEFAULT_SETTINGS = {
    repoUrl: '',
    token: '',
    userName: '',
    userEmail: '',
    autoSync: true
};

/**
 * 加载并刷新状态
 */
async function refreshStatus() {
    try {
        const response = await fetch('/api/git-backup/status');
        const data = await response.json();
        
        const statusEl = document.getElementById('git_backup_status_text');
        const timeEl = document.getElementById('git_backup_last_time');
        const errorEl = document.getElementById('git_backup_error_msg');

        if (!statusEl) return;

        statusEl.textContent = data.status === 'idle' ? '空闲' : (data.status === 'syncing' ? '同步中...' : '错误');
        statusEl.className = data.status;
        timeEl.textContent = data.lastSync || '从未同步';

        if (data.error) {
            errorEl.textContent = '错误详情: ' + data.error;
            errorEl.style.display = 'block';
        } else {
            errorEl.style.display = 'none';
        }
    } catch (e) {
        console.error('[GitBackup] 刷新状态失败', e);
    }
}

/**
 * 手动同步
 */
async function syncNow() {
    const settings = extension_settings[PLUGIN_NAME];
    if (!settings.repoUrl) {
        toastr.warning('请先配置仓库地址');
        return;
    }

    const btn = document.getElementById('git_backup_sync_now_btn');
    btn.disabled = true;
    btn.textContent = '同步中...';

    try {
        const response = await fetch('/api/git-backup/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        
        const result = await response.json();
        if (result.success) {
            toastr.success('Git 同步成功！');
        } else {
            throw new Error(result.error);
        }
    } catch (err) {
        toastr.error('同步失败: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '立即同步';
        refreshStatus();
    }
}

/**
 * 保存设置
 */
function saveGitSettings() {
    const settings = extension_settings[PLUGIN_NAME];
    settings.repoUrl = document.getElementById('git_repo_url').value.trim();
    settings.token = document.getElementById('git_token').value.trim();
    settings.userName = document.getElementById('git_user_name').value.trim();
    settings.userEmail = document.getElementById('git_user_email').value.trim();
    
    saveSettingsDebounced();
    toastr.success('设置已保存');
}

/**
 * 初始化
 */
async function initPlugin() {
    // 1. 初始化设置对象
    if (!extension_settings[PLUGIN_NAME]) {
        extension_settings[PLUGIN_NAME] = { ...DEFAULT_SETTINGS };
    }
    const settings = extension_settings[PLUGIN_NAME];

    // 2. 加载 HTML 模板
    const html = await renderExtensionTemplateAsync('third-party/st-git-backup', 'settings');
    $('#extensions_settings').append(html);

    // 3. 填充数据
    document.getElementById('git_repo_url').value = settings.repoUrl;
    document.getElementById('git_token').value = settings.token;
    document.getElementById('git_user_name').value = settings.userName;
    document.getElementById('git_user_email').value = settings.userEmail;

    // 4. 事件绑定
    document.getElementById('git_backup_save_btn').addEventListener('click', saveGitSettings);
    document.getElementById('git_backup_sync_now_btn').addEventListener('click', syncNow);

    // 5. 启动状态轮询
    refreshStatus();
    setInterval(refreshStatus, 5000);
}

// 导出初始化函数
jQuery(initPlugin);
