import CachingAdapter from './Caching'
import { Bookmark, Folder, ItemLocation } from '../Tree'
import {
  NetworkError,
  AuthenticationError,
  HttpError,
  ParseResponseError,
} from '../../errors/Error'
import { IAccountData } from '../interfaces/AccountStorage'

export default class LinkdingAdapter extends CachingAdapter {
  private baseUrl: string
  private apiToken: string

  constructor(data: IAccountData) {
    super(data)
    this.setData(data)
  }

  static getDefaultValues() {
    return {
      type: 'linkding',
      url: '',
      apiToken: '',
      strategy: 'default',
      syncInterval: 15,
      nestedSync: true,
      failsafe: true,
    }
  }

  setData(data: IAccountData): void {
    super.setData(data)
    this.baseUrl = data.url ? data.url.replace(/\/$/, '') : ''
    this.apiToken = data.apiToken || ''
  }

  getLabel(): string {
    return 'Linkding'
  }

  async onSyncStart(): Promise<void> {
    // Validate connection
    try {
      const response = await fetch(`${this.baseUrl}/api/bookmarks/?limit=1`, {
        headers: {
          Authorization: `Token ${this.apiToken}`,
        },
      })

      if (response.status === 401) {
        throw new AuthenticationError()
      }

      if (!response.ok) {
        throw new HttpError(response.status, 'GET')
      }

      try {
        await response.json()
      } catch (e) {
        throw new ParseResponseError(await response.text())
      }
    } catch (e) {
      if (
        e instanceof AuthenticationError ||
        e instanceof HttpError ||
        e instanceof ParseResponseError
      ) {
        throw e
      }
      throw new NetworkError()
    }
  }

  async getBookmarksTree(): Promise<Folder<typeof ItemLocation.SERVER>> {
    console.log('GETTING BOOKMARKS')
    const rootFolder = new Folder({
      id: 'root',
      title: 'Linkding Bookmarks',
      location: ItemLocation.SERVER,
      isRoot: true,
      children: [],
    })

    try {
      // Fetch all bookmarks from Linkding
      let nextUrl = `${this.baseUrl}/api/bookmarks/?limit=100`
      let bookmarks = []

      while (nextUrl) {
        const response = await fetch(nextUrl, {
          headers: {
            Authorization: `Token ${this.apiToken}`,
          },
        })

        if (!response.ok) {
          throw new HttpError(response.status, 'GET')
        }

        const data = await response.json()
        bookmarks = bookmarks.concat(data.results)
        nextUrl = data.next
      }

      // Convert Linkding bookmarks to Floccus bookmarks
      for (const bookmark of bookmarks) {
        const floccusBookmark = new Bookmark({
          id: bookmark.id.toString(),
          parentId: 'root',
          url: bookmark.url,
          title: bookmark.title || bookmark.website_title || bookmark.url,
          tags: bookmark.tag_names || [],
          location: ItemLocation.SERVER,
        })

        rootFolder.children.push(floccusBookmark)
      }

      return rootFolder
    } catch (e) {
      if (e instanceof HttpError) {
        throw e
      }
      throw new NetworkError()
    }
  }

  async createBookmark(
    bookmark: Bookmark<typeof ItemLocation.SERVER>
  ): Promise<string> {
    try {
      const tags = bookmark.tags || []
      const response = await fetch(`${this.baseUrl}/api/bookmarks/`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: bookmark.url,
          title: bookmark.title,
          description: '',
          tags,
        }),
      })

      if (!response.ok) {
        throw new HttpError(response.status, 'POST')
      }

      const data = await response.json()
      return data.id.toString()
    } catch (e) {
      if (e instanceof HttpError) {
        throw e
      }
      throw new NetworkError()
    }
  }

  async updateBookmark(
    bookmark: Bookmark<typeof ItemLocation.SERVER>
  ): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/bookmarks/${bookmark.id}/`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Token ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: bookmark.url,
            title: bookmark.title,
            tags: bookmark.tags.join(' '),
          }),
        }
      )

      if (!response.ok) {
        throw new HttpError(response.status, 'PATCH')
      }
    } catch (e) {
      if (e instanceof HttpError) {
        throw e
      }
      throw new NetworkError()
    }
  }

  async removeBookmark(
    bookmark: Bookmark<typeof ItemLocation.SERVER>
  ): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/bookmarks/${bookmark.id}/`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Token ${this.apiToken}`,
          },
        }
      )

      if (!response.ok && response.status !== 404) {
        throw new HttpError(response.status, 'DELETE')
      }
    } catch (e) {
      if (e instanceof HttpError) {
        throw e
      }
      throw new NetworkError()
    }
  }

  // Folders are not supported in Linkding, so these methods are no-ops
  async createFolder(): Promise<string> {
    return 'root'
  }

  async updateFolder(): Promise<void> {
    // No-op
  }

  async removeFolder(): Promise<void> {
    // No-op
  }

  async orderFolder(): Promise<void> {
    // No-op
  }
}
