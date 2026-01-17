const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// 插件元数据
const PLUGIN_ID = 'st-git-backup';
const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, 'data', 'default-user', 'chats');
const CONFIG_PATH = path.join(__dirname, 'git-config.json');

// 任务状态
let currentStatus = { status: 'idle', lastSync: null, error: null };

/**
 * 加载本地配置文件
 */
function loadLocalConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const content = fs.readFileSync(CONFIG_PATH, 'utf8');
            return JSON.parse(content);
        }
    } catch (e) {
        console.error('[GitBackup] 读取配置文件失败:', e);
    }
    return {};
}

/**
 * 辅助：执行命令行
 */
function runCommand(cmd, cwd = ROOT_DIR) {
    return new Promise((resolve, reject) => {
        exec(cmd, { cwd }, (error, stdout, stderr) => {
            if (error) {
                reject({ error, stderr });
                return;
            }
            resolve(stdout.trim());
        });
    });
}

/**
 * 核心：执行 Git 同步逻辑
 */
async function performGitSync(options) {
    // 合并配置：优先使用传入参数，其次使用配置文件
    const localConfig = loadLocalConfig();
    const repoUrl = options.repoUrl || localConfig.repoUrl;
    const token = options.token || localConfig.token;
    const userName = options.userName || localConfig.userName;
    const userEmail = options.userEmail || localConfig.userEmail;
    const branch = options.branch || localConfig.branch || 'master';

    if (!repoUrl) throw new Error('未配置 Git 仓库地址');

    try {
        currentStatus.status = 'syncing';
        
        // 确保目录存在
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

        // 1. 检查是否存在 .git 文件夹
        if (!fs.existsSync(path.join(DATA_DIR, '.git'))) {
            console.log('[GitBackup] 初始化 Git 仓库...');
            await runCommand('git init', DATA_DIR);
        }

        // 2. 配置用户信息
        if (userName) await runCommand(`git config user.name "${userName}"`, DATA_DIR);
        if (userEmail) await runCommand(`git config user.email "${userEmail}"`, DATA_DIR);

        // 3. 处理带 Token 的 URL
        let authenticatedUrl = repoUrl;
        if (token && repoUrl.startsWith('https://')) {
            authenticatedUrl = repoUrl.replace('https://', `https://oauth2:${token}@`);
        }

        // 4. 设置远程仓库
        try {
            await runCommand('git remote remove origin', DATA_DIR);
        } catch (e) { /* 忽略错误 */ }
        await runCommand(`git remote add origin ${authenticatedUrl}`, DATA_DIR);

        // 5. 提交并推送
        await runCommand('git add .', DATA_DIR);
        const timestamp = new Date().toLocaleString();
        
        // 检查是否有变动需要提交
        const status = await runCommand('git status --porcelain', DATA_DIR);
        if (status) {
            await runCommand(`git commit -m "Auto sync chat history: ${timestamp}"`, DATA_DIR);
            await runCommand(`git push -u origin ${branch} --force`, DATA_DIR);
            currentStatus.lastSync = timestamp;
            currentStatus.error = null;
        } else {
            console.log('[GitBackup] 没有变动需要同步');
        }

        currentStatus.status = 'idle';
        return { success: true };
    } catch (err) {
        console.error('[GitBackup] 同步失败:', err);
        currentStatus.status = 'error';
        currentStatus.error = err.stderr || err.error?.message || '未知错误';
        throw err;
    }
}

function init(app, config) {
    console.log('[GitBackup] 后端插件已启动');

    // 启动时立即尝试一次同步（访问酒馆时触发的逻辑）
    // 使用 setTimeout 确保酒馆系统本身已完全初始化
    setTimeout(async () => {
        try {
            console.log('[GitBackup] 检测到客户端访问，正在执行启动同步...');
            await performGitSync({});
            console.log('[GitBackup] 启动同步执行成功');
        } catch (e) {
            console.error('[GitBackup] 启动同步执行失败:', e.message);
        }
    }, 10000); // 稍微延迟，避开启动高峰

    // 接口：获取当前同步状态
    app.get('/api/git-backup/status', (req, res) => {
        res.json(currentStatus);
    });

    // 接口：手动触发同步
    app.post('/api/git-backup/sync', async (req, res) => {
        try {
            await performGitSync(req.body || {});
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
}

module.exports = {
  init,
  info: {
    id: PLUGIN_ID,
    name: "Git Backup Assistant",
    description: "Sync chat history to Git",
  },
};
