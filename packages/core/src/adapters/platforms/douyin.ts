/**
 * 抖音适配器（CLI + Chrome MCP 版）
 * 说明：通过页面执行脚本填充标题和内容，并触发保存草稿。
 */
import { BaseAdapter } from '../base'
import type { Article, AuthResult, SyncResult, PlatformMeta } from '../../types'
import type { PublishOptions } from '../types'
import { createLogger } from '../../lib/logger'

const logger = createLogger('Douyin')

export class DouyinAdapter extends BaseAdapter {
  readonly meta: PlatformMeta = {
    id: 'douyin',
    name: '抖音',
    icon: 'https://www.douyin.com/favicon.ico',
    homepage: 'https://creator.douyin.com/',
    capabilities: ['article', 'draft'],
  }

  private async ensureCreatorTab(): Promise<{ id: number }> {
    if (!this.runtime.tabs) {
      throw new Error('抖音发布需要浏览器 tabs API 支持')
    }
    const tabs = await this.runtime.tabs.query('https://creator.douyin.com/*')
    if (tabs.length > 0) {
      return { id: tabs[0].id }
    }
    const tab = await this.runtime.tabs.create(this.meta.homepage, true)
    await this.runtime.tabs.waitForLoad(tab.id, 60000)
    return tab
  }

  async checkAuth(): Promise<AuthResult> {
    try {
      const tab = await this.ensureCreatorTab()
      const result = await this.runtime.tabs!.executeScript(tab.id, () => {
        const href = location.href
        const hasLoginForm = !!document.querySelector('input[type="password"], input[name="password"]')
        const hasLoginText = /login|signin|登录/i.test(document.body?.innerText || '')
        return { href, hasLoginForm, hasLoginText }
      }, [])

      const isAuthenticated = !result.hasLoginForm && !result.hasLoginText && !/login/i.test(result.href)
      return { isAuthenticated }
    } catch (error) {
      logger.debug('checkAuth error:', error)
      return { isAuthenticated: false, error: (error as Error).message }
    }
  }

  async publish(article: Article, _options?: PublishOptions): Promise<SyncResult> {
    if (!this.runtime.tabs) {
      return this.createResult(false, { error: '抖音发布需要浏览器 tabs API 支持' })
    }

    const tab = await this.ensureCreatorTab()
    await this.runtime.tabs.waitForLoad(tab.id, 60000)

    const payload = {
      title: article.title,
      html: article.html || article.markdown,
    }

    const result = await this.runtime.tabs.executeScript(tab.id, (data) => {
      const findTitleInput = () => {
        const inputs = Array.from(document.querySelectorAll('input, textarea')) as Array<HTMLInputElement | HTMLTextAreaElement>
        return inputs.find((el) => /标题|title/i.test(el.placeholder || '')) || inputs.find((el) => el.name === 'title') || null
      }

      const findEditor = () => {
        const candidates = Array.from(document.querySelectorAll('[contenteditable="true"]')) as HTMLElement[]
        if (candidates.length === 0) return null
        return candidates.sort((a, b) => (b.innerText?.length || 0) - (a.innerText?.length || 0))[0]
      }

      const setValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
        el.focus()
        el.value = value
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }

      const titleInput = findTitleInput()
      if (titleInput) {
        setValue(titleInput, data.title)
      }

      const editor = findEditor()
      if (editor) {
        editor.focus()
        editor.innerHTML = ''
        editor.insertAdjacentHTML('afterbegin', data.html)
        editor.dispatchEvent(new Event('input', { bubbles: true }))
      }

      const buttons = Array.from(document.querySelectorAll('button, [role="button"]')) as HTMLElement[]
      const saveBtn = buttons.find((btn) => /保存|草稿/i.test(btn.innerText || ''))
      if (saveBtn) {
        saveBtn.click()
      }

      return {
        titleSet: !!titleInput,
        editorSet: !!editor,
        saveClicked: !!saveBtn,
        href: location.href,
      }
    }, [payload])

    if (!result.titleSet || !result.editorSet) {
      return this.createResult(false, { error: '未找到标题或正文编辑器，需检查页面结构变化' })
    }

    return this.createResult(true, {
      postUrl: result.href,
      draftOnly: true,
      message: result.saveClicked ? '已触发保存草稿' : '已填充内容，请手动保存草稿',
    })
  }
}
