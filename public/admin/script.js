// 全局状态管理
const state = {
    currentPage: 1,
    pageSize: 24,
    totalImages: 0,
    totalPages: 0,
    currentDirectory: '',
    searchKeyword: '',
    sortOption: 'name',
    images: [],
    directories: [],
    stats: {
        totalImages: 0,
        totalDirectories: 0,
        cacheStatus: 'unknown',
        serverStatus: 'unknown'
    }
};

// DOM元素缓存
const elements = {
    // 统计信息
    totalImages: document.getElementById('total-images'),
    totalDirectories: document.getElementById('total-directories'),
    cacheStatus: document.getElementById('cache-status'),
    serverStatus: document.getElementById('server-status'),
    
    // 目录管理
    directoryList: document.getElementById('directory-list'),
    directoryFilter: document.getElementById('directory-filter'),
    addDirBtn: document.getElementById('add-dir-btn'),
    
    // 图片管理
    imagesGrid: document.getElementById('images-grid'),
    imagesCount: document.getElementById('images-count'),
    uploadBtn: document.getElementById('upload-btn'),
    
    // 搜索和筛选
    searchInput: document.getElementById('search-input'),
    searchBtn: document.getElementById('search-btn'),
    sortOption: document.getElementById('sort-option'),
    
    // 分页
    pagination: document.getElementById('pagination'),
    
    // 系统操作
    updateBtn: document.getElementById('update-btn'),
    clearCacheBtn: document.getElementById('clear-cache-btn'),
    
    // 模态框
    modal: document.getElementById('modal'),
    modalTitle: document.getElementById('modal-title'),
    modalBody: document.getElementById('modal-body'),
    modalFooter: document.getElementById('modal-footer'),
    closeModal: document.getElementById('close-modal'),
    
    // 目录创建模态框
    dirModal: document.getElementById('dir-modal'),
    closeDirModal: document.getElementById('close-dir-modal'),
    cancelDirBtn: document.getElementById('cancel-dir-btn'),
    submitDirBtn: document.getElementById('submit-dir-btn'),
    dirNameInput: document.getElementById('dir-name'),
    createDirForm: document.getElementById('create-dir-form'),
    
    // 图片详情模态框
    imageModal: document.getElementById('image-modal'),
    imageModalTitle: document.getElementById('image-modal-title'),
    imageDetail: document.getElementById('image-detail'),
    closeImageModal: document.getElementById('close-image-modal'),
    
    // 图片上传模态框
    uploadModal: document.getElementById('upload-modal'),
    closeUploadModal: document.getElementById('close-upload-modal'),
    cancelUploadBtn: document.getElementById('cancel-upload-btn'),
    submitUploadBtn: document.getElementById('submit-upload-btn'),
    uploadForm: document.getElementById('upload-form'),
    uploadFile: document.getElementById('upload-file'),
    uploadDirectory: document.getElementById('upload-directory')
};

// 初始化应用
async function init() {
    try {
        // 加载初始数据
        await Promise.all([
            loadDirectories(),
            loadStats(),
            loadImages()
        ]);
        
        // 绑定事件监听器
        bindEvents();
        
        // 更新UI
        updateStats();
        renderDirectories();
        renderImages();
        renderPagination();
    } catch (error) {
        console.error('初始化失败:', error);
        showMessage('初始化失败，请刷新页面重试', 'error');
    }
}

// 加载目录列表
async function loadDirectories() {
    try {
        // 加载目录列表
        const dirResponse = await fetch('/admin/api/directories');
        if (!dirResponse.ok) throw new Error('加载目录失败');
        
        const dirNames = await dirResponse.json();
        
        // 加载图片列表以计算每个目录的图片数量
        const listResponse = await fetch('/list.json');
        if (!listResponse.ok) throw new Error('加载图片列表失败');
        
        const imageList = await listResponse.json();
        
        // 转换目录数据格式
        state.directories = dirNames.map(dirName => {
            // 计算该目录下的图片数量
            const count = imageList[dirName] ? imageList[dirName].length : 0;
            
            return {
                name: dirName,
                count: count
            };
        });
        
        // 更新统计信息
        state.stats.totalDirectories = state.directories.length;
        
        // 渲染目录列表
        renderDirectories();
        
        // 更新目录筛选下拉菜单
        updateDirectoryFilter();
    } catch (error) {
        console.error('加载目录失败:', error);
        showMessage('加载目录失败', 'error');
    }
}

// 加载统计信息
async function loadStats() {
    try {
        const response = await fetch('/admin/api/stats');
        if (!response.ok) throw new Error('加载统计信息失败');
        
        const stats = await response.json();
        
        // 获取实际的统计数据（处理嵌套结构）
        const actualStats = stats.stats || {};
        const totalImages = actualStats.totalImages || 0;
        const totalDirectories = actualStats.totalDirectories || 0;
        
        // 确定缓存状态
        let cacheStatus = 'unknown';
        if (stats.cache) {
            cacheStatus = 'memory'; // 默认使用内存缓存
        }
        
        state.stats = {
            totalImages: totalImages,
            totalDirectories: totalDirectories,
            cacheStatus: cacheStatus,
            serverStatus: 'online'
        };
    } catch (error) {
        console.error('加载统计信息失败:', error);
        showMessage('加载统计信息失败', 'error');
    }
}

// 加载图片列表
async function loadImages(page = 1) {
    try {
        const params = new URLSearchParams();
        params.append('page', page);
        params.append('limit', state.pageSize);
        
        if (state.currentDirectory) {
            params.append('directory', state.currentDirectory);
        }
        
        if (state.searchKeyword) {
            params.append('keyword', state.searchKeyword);
        }
        
        if (state.sortOption) {
            params.append('sort', state.sortOption);
        }
        
        const response = await fetch(`/admin/api/images?${params.toString()}`);
        if (!response.ok) throw new Error('加载图片失败');
        
        const data = await response.json();
        state.images = data.images || [];
        state.totalImages = data.total || 0;
        state.totalPages = Math.ceil(state.totalImages / state.pageSize);
        state.currentPage = page;
    } catch (error) {
        console.error('加载图片失败:', error);
        showMessage('加载图片失败', 'error');
    }
}

// 绑定事件监听器
function bindEvents() {
    // 目录管理事件
    elements.addDirBtn.addEventListener('click', openCreateDirModal);
    
    // 搜索和筛选事件
    elements.searchBtn.addEventListener('click', handleSearch);
    elements.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    elements.sortOption.addEventListener('change', handleSortChange);
    elements.directoryFilter.addEventListener('change', handleDirectoryFilterChange);
    
    // 系统操作事件
    elements.updateBtn.addEventListener('click', handleUpdate);
    elements.clearCacheBtn.addEventListener('click', handleClearCache);
    
    // 模态框事件
    elements.closeModal.addEventListener('click', closeModal);
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) closeModal();
    });
    
    elements.closeDirModal.addEventListener('click', closeCreateDirModal);
    elements.cancelDirBtn.addEventListener('click', closeCreateDirModal);
    elements.dirModal.addEventListener('click', (e) => {
        if (e.target === elements.dirModal) closeCreateDirModal();
    });
    elements.submitDirBtn.addEventListener('click', handleCreateDir);
    elements.createDirForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleCreateDir();
    });
    
    elements.closeImageModal.addEventListener('click', closeImageModal);
    elements.imageModal.addEventListener('click', (e) => {
        if (e.target === elements.imageModal) closeImageModal();
    });
    
    // 上传模态框事件
    elements.uploadBtn.addEventListener('click', openUploadModal);
    elements.closeUploadModal.addEventListener('click', closeUploadModal);
    elements.cancelUploadBtn.addEventListener('click', closeUploadModal);
    elements.uploadModal.addEventListener('click', (e) => {
        if (e.target === elements.uploadModal) closeUploadModal();
    });
    elements.submitUploadBtn.addEventListener('click', handleUpload);
    elements.uploadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleUpload();
    });
    
    // 窗口事件
    window.addEventListener('resize', handleResize);
}

// 渲染统计信息
function updateStats() {
    elements.totalImages.textContent = state.stats.totalImages;
    elements.totalDirectories.textContent = state.stats.totalDirectories;
    elements.cacheStatus.textContent = state.stats.cacheStatus;
    elements.serverStatus.textContent = state.stats.serverStatus;
}

// 渲染目录列表
function renderDirectories() {
    elements.directoryList.innerHTML = '';
    
    // 添加"所有目录"选项
    const allDirItem = createDirectoryItem('', '所有目录', state.stats.totalImages);
    elements.directoryList.appendChild(allDirItem);
    
    // 添加各个目录
    state.directories.forEach(dir => {
        const dirItem = createDirectoryItem(dir.name, dir.name, dir.count);
        elements.directoryList.appendChild(dirItem);
    });
}

// 创建目录列表项
function createDirectoryItem(value, displayName, count) {
    const dirItem = document.createElement('div');
    dirItem.className = `directory-item ${state.currentDirectory === value ? 'active' : ''}`;
    dirItem.dataset.value = value;
    
    // 目录信息
    const dirInfo = document.createElement('div');
    dirInfo.className = 'directory-info';
    
    const dirName = document.createElement('span');
    dirName.className = 'directory-name';
    dirName.textContent = displayName;
    
    const dirCount = document.createElement('span');
    dirCount.className = 'directory-count';
    dirCount.textContent = count;
    
    dirInfo.appendChild(dirName);
    dirInfo.appendChild(dirCount);
    
    // 目录操作按钮
    const dirActions = document.createElement('div');
    dirActions.className = 'directory-actions';
    
    // 删除按钮（仅非空目录显示）
    if (value) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-small btn-danger';
        deleteBtn.textContent = '删除';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            confirmDeleteDirectory(value, displayName);
        });
        dirActions.appendChild(deleteBtn);
    }
    
    // 点击目录切换视图
    dirItem.addEventListener('click', () => {
        switchDirectory(value);
    });
    
    dirItem.appendChild(dirInfo);
    dirItem.appendChild(dirActions);
    
    return dirItem;
}

// 更新目录筛选下拉菜单
function updateDirectoryFilter() {
    // 清空现有选项（保留第一个"所有目录"选项）
    while (elements.directoryFilter.options.length > 1) {
        elements.directoryFilter.remove(1);
    }
    
    // 添加各个目录选项
    state.directories.forEach(dir => {
        const option = document.createElement('option');
        option.value = dir.name;
        option.textContent = dir.name;
        elements.directoryFilter.appendChild(option);
    });
    
    // 设置当前选中的目录
    elements.directoryFilter.value = state.currentDirectory;
}

// 渲染图片列表
function renderImages() {
    elements.imagesGrid.innerHTML = '';
    elements.imagesCount.textContent = state.totalImages;
    
    if (state.images.length === 0) {
        elements.imagesGrid.innerHTML = '<div class="empty-state">暂无图片</div>';
        return;
    }
    
    state.images.forEach(image => {
        const imageCard = createImageCard(image);
        elements.imagesGrid.appendChild(imageCard);
    });
}

// 创建图片卡片
function createImageCard(image) {
    const card = document.createElement('div');
    card.className = 'image-card';
    
    // 图片缩略图
    const thumbnail = document.createElement('img');
    thumbnail.className = 'image-thumbnail';
    thumbnail.src = `/api/${image.path}`;
    thumbnail.alt = image.name;
    thumbnail.loading = 'lazy';
    
    // 图片信息
    const info = document.createElement('div');
    info.className = 'image-info';
    
    const name = document.createElement('div');
    name.className = 'image-name';
    name.textContent = image.name;
    
    const meta = document.createElement('div');
    meta.className = 'image-meta';
    meta.innerHTML = `
        <span>${formatSize(image.size)}</span>
        <span>${formatDate(image.uploadtime)}</span>
    `;
    
    info.appendChild(name);
    info.appendChild(meta);
    
    // 图片操作按钮
    const actions = document.createElement('div');
    actions.className = 'image-actions';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-small btn-danger';
    deleteBtn.textContent = '删除';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDeleteImage(image);
    });
    
    actions.appendChild(deleteBtn);
    
    // 点击卡片查看详情
    card.addEventListener('click', () => {
        viewImageDetail(image);
    });
    
    card.appendChild(thumbnail);
    card.appendChild(info);
    card.appendChild(actions);
    
    return card;
}

// 渲染分页控件
function renderPagination() {
    elements.pagination.innerHTML = '';
    
    if (state.totalPages <= 1) {
        return;
    }
    
    // 上一页按钮
    const prevBtn = createPaginationButton('上一页', state.currentPage > 1 ? state.currentPage - 1 : null);
    elements.pagination.appendChild(prevBtn);
    
    // 页码按钮
    const startPage = Math.max(1, state.currentPage - 2);
    const endPage = Math.min(state.totalPages, startPage + 4);
    
    if (startPage > 1) {
        const firstBtn = createPaginationButton('1', 1);
        elements.pagination.appendChild(firstBtn);
        
        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            elements.pagination.appendChild(ellipsis);
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = createPaginationButton(i, i, state.currentPage === i);
        elements.pagination.appendChild(pageBtn);
    }
    
    if (endPage < state.totalPages) {
        if (endPage < state.totalPages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            elements.pagination.appendChild(ellipsis);
        }
        
        const lastBtn = createPaginationButton(state.totalPages, state.totalPages);
        elements.pagination.appendChild(lastBtn);
    }
    
    // 下一页按钮
    const nextBtn = createPaginationButton('下一页', state.currentPage < state.totalPages ? state.currentPage + 1 : null);
    elements.pagination.appendChild(nextBtn);
}

// 创建分页按钮
function createPaginationButton(text, page, isActive = false) {
    const btn = document.createElement('button');
    btn.className = `pagination-btn ${isActive ? 'active' : ''} ${page === null ? 'disabled' : ''}`;
    btn.textContent = text;
    
    if (page !== null) {
        btn.addEventListener('click', () => {
            goToPage(page);
        });
    }
    
    return btn;
}

// 目录切换
function switchDirectory(directory) {
    state.currentDirectory = directory;
    state.currentPage = 1;
    loadAndRender();
    renderDirectories();
}

// 搜索处理
function handleSearch() {
    state.searchKeyword = elements.searchInput.value.trim();
    state.currentPage = 1;
    loadAndRender();
}

// 排序处理
function handleSortChange() {
    state.sortOption = elements.sortOption.value;
    state.currentPage = 1;
    loadAndRender();
}

// 目录筛选处理
function handleDirectoryFilterChange() {
    const directory = elements.directoryFilter.value;
    state.currentDirectory = directory;
    state.currentPage = 1;
    loadAndRender();
}

// 页面跳转
function goToPage(page) {
    loadImages(page).then(() => {
        renderImages();
        renderPagination();
        scrollToTop();
    });
}

// 加载并渲染所有数据
function loadAndRender() {
    Promise.all([
        loadImages(),
        loadStats()
    ]).then(() => {
        renderImages();
        renderPagination();
        updateStats();
        scrollToTop();
    });
}

// 打开创建目录模态框
function openCreateDirModal() {
    elements.dirNameInput.value = '';
    elements.dirModal.classList.add('show');
    elements.dirNameInput.focus();
}

// 关闭创建目录模态框
function closeCreateDirModal() {
    elements.dirModal.classList.remove('show');
}

// 处理目录创建
async function handleCreateDir() {
    const dirName = elements.dirNameInput.value.trim();
    if (!dirName) {
        showMessage('请输入目录名称', 'error');
        return;
    }
    
    try {
        const response = await fetch('/admin/api/directories', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: dirName })
        });
        
        if (!response.ok) throw new Error('创建目录失败');
        
        closeCreateDirModal();
        showMessage('目录创建成功', 'success');
        
        // 重新加载数据
        await Promise.all([
            loadDirectories(),
            loadStats()
        ]);
        updateStats();
        renderDirectories();
    } catch (error) {
        console.error('创建目录失败:', error);
        showMessage('创建目录失败', 'error');
    }
}

// 确认删除目录
function confirmDeleteDirectory(directoryName, displayName) {
    showModal({
        title: '确认删除目录',
        body: `您确定要删除目录 "${displayName}" 吗？此操作将删除目录及其所有图片，无法恢复。`,
        buttons: [
            { text: '取消', className: 'btn btn-secondary', action: closeModal },
            { 
                text: '删除', 
                className: 'btn btn-danger', 
                action: () => deleteDirectory(directoryName, displayName)
            }
        ]
    });
}

// 删除目录
async function deleteDirectory(directoryName, displayName) {
    try {
        const response = await fetch(`/admin/api/directories/${encodeURIComponent(directoryName)}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('删除目录失败');
        
        closeModal();
        showMessage('目录删除成功', 'success');
        
        // 如果当前在删除的目录，切换到所有目录
        if (state.currentDirectory === directoryName) {
            state.currentDirectory = '';
        }
        
        // 重新加载数据
        await Promise.all([
            loadDirectories(),
            loadStats(),
            loadImages()
        ]);
        updateStats();
        renderDirectories();
        renderImages();
        renderPagination();
    } catch (error) {
        console.error('删除目录失败:', error);
        showMessage('删除目录失败', 'error');
    }
}

// 确认删除图片
function confirmDeleteImage(image) {
    showModal({
        title: '确认删除图片',
        body: `您确定要删除图片 "${image.name}" 吗？此操作无法恢复。`,
        buttons: [
            { text: '取消', className: 'btn btn-secondary', action: closeModal },
            { 
                text: '删除', 
                className: 'btn btn-danger', 
                action: () => deleteImage(image)
            }
        ]
    });
}

// 删除图片
async function deleteImage(image) {
    try {
        const response = await fetch(`/admin/api/images/${encodeURIComponent(image.path)}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('删除图片失败');
        
        closeModal();
        showMessage('图片删除成功', 'success');
        
        // 重新加载所有相关数据
        await Promise.all([
            loadImages(),
            loadStats(),
            loadDirectories()
        ]);
        
        // 更新所有相关UI
        renderImages();
        renderPagination();
        updateStats();
        renderDirectories();
    } catch (error) {
        console.error('删除图片失败:', error);
        showMessage('删除图片失败', 'error');
    }
}

// 查看图片详情
function viewImageDetail(image) {
    elements.imageModalTitle.textContent = image.name;
    
    elements.imageDetail.innerHTML = `
        <div class="image-preview">
            <img src="/api/${image.path}" alt="${image.name}">
        </div>
        <div class="image-details">
            <div class="detail-item">
                <div class="detail-label">文件名</div>
                <div class="detail-value">${image.name}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">路径</div>
                <div class="detail-value">${image.path}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">大小</div>
                <div class="detail-value">${formatSize(image.size)}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">修改时间</div>
                <div class="detail-value">${formatDate(image.modified)}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">目录</div>
                <div class="detail-value">${image.directory}</div>
            </div>
        </div>
    `;
    
    elements.imageModal.classList.add('show');
}

// 打开上传模态框
function openUploadModal() {
    elements.uploadForm.reset();
    // 更新目录选项
    updateUploadDirectoryOptions();
    elements.uploadModal.classList.add('show');
    elements.uploadFile.focus();
}

// 关闭上传模态框
function closeUploadModal() {
    elements.uploadModal.classList.remove('show');
}

// 更新上传目录选项
function updateUploadDirectoryOptions() {
    const select = elements.uploadDirectory;
    // 保留第一个根目录选项
    const rootOption = select.children[0];
    select.innerHTML = '';
    select.appendChild(rootOption);
    
    // 添加所有目录选项
    state.directories.forEach(dir => {
        const option = document.createElement('option');
        option.value = dir.name;
        option.textContent = dir.name;
        select.appendChild(option);
    });
}

// 处理图片上传
async function handleUpload() {
    try {
        const file = elements.uploadFile.files[0];
        if (!file) {
            showMessage('请选择要上传的图片', 'error');
            return;
        }
        
        const directory = elements.uploadDirectory.value;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('directory', directory);
        
        // 显示上传状态
        elements.submitUploadBtn.disabled = true;
        elements.submitUploadBtn.textContent = '上传中...';
        
        const response = await fetch('/admin/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            showMessage('图片上传成功', 'success');
            closeUploadModal();
            
            // 重新加载数据
            await Promise.all([
                loadImages(),
                loadStats(),
                loadDirectories()
            ]);
            
            // 更新UI
            renderImages();
            renderPagination();
            updateStats();
            renderDirectories();
        } else {
            showMessage(`上传失败: ${result.message || '未知错误'}`, 'error');
        }
    } catch (error) {
        console.error('上传失败:', error);
        showMessage(`上传失败: ${error.message}`, 'error');
    } finally {
        // 恢复按钮状态
        elements.submitUploadBtn.disabled = false;
        elements.submitUploadBtn.textContent = '上传';
    }
}

// 关闭图片详情模态框
function closeImageModal() {
    elements.imageModal.classList.remove('show');
}

// 显示模态框
function showModal(options) {
    elements.modalTitle.textContent = options.title || '操作确认';
    elements.modalBody.innerHTML = options.body || '';
    
    // 清空现有按钮
    elements.modalFooter.innerHTML = '';
    
    // 添加按钮
    options.buttons.forEach(btn => {
        const button = document.createElement('button');
        button.className = btn.className;
        button.textContent = btn.text;
        button.addEventListener('click', btn.action);
        elements.modalFooter.appendChild(button);
    });
    
    elements.modal.classList.add('show');
}

// 关闭模态框
function closeModal() {
    elements.modal.classList.remove('show');
}

// 处理更新图片列表
async function handleUpdate() {
    try {
        elements.updateBtn.disabled = true;
        elements.updateBtn.textContent = '更新中...';
        
        const response = await fetch('/admin/api/update', {
            method: 'POST'
        });
        
        if (!response.ok) throw new Error('更新失败');
        
        showMessage('图片列表更新成功', 'success');
        
        // 重新加载数据
        await Promise.all([
            loadImages(),
            loadDirectories(),
            loadStats()
        ]);
        renderImages();
        renderPagination();
        renderDirectories();
        updateStats();
    } catch (error) {
        console.error('更新失败:', error);
        showMessage('更新失败', 'error');
    } finally {
        elements.updateBtn.disabled = false;
        elements.updateBtn.textContent = '更新图片列表';
    }
}

// 处理清空缓存
async function handleClearCache() {
    try {
        elements.clearCacheBtn.disabled = true;
        elements.clearCacheBtn.textContent = '清空ing...';
        
        const response = await fetch('/admin/api/cache/clear', {
            method: 'POST'
        });
        
        if (!response.ok) throw new Error('清空缓存失败');
        
        showMessage('缓存清空成功', 'success');
        await loadStats();
        updateStats();
    } catch (error) {
        console.error('清空缓存失败:', error);
        showMessage('清空缓存失败', 'error');
    } finally {
        elements.clearCacheBtn.disabled = false;
        elements.clearCacheBtn.textContent = '清空缓存';
    }
}

// 显示消息
function showMessage(message, type = 'info') {
    // 简单的消息显示，可根据需要扩展为更复杂的通知组件
    alert(message);
}

// 格式化文件大小
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 格式化日期
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 滚动到顶部
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 处理窗口大小变化
function handleResize() {
    // 响应式处理，根据需要添加
}

// 初始化应用
init();

