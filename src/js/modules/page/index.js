'use strict'

const PageActions = require('./actions')


/**
 * The page class is shared between the background application and
 * the tabs application that runs as a content script.
 */
class PageModule {

    constructor(app, background = true) {
        this.app = app
        // Hardcoded blacklist of sites because there is not yet a solution
        // that works for chrome and firefox using exclude site-urls.
        //
        // These sites are blocked primarily because they are javascript-heavy
        // which in turn leads to 100% cpu usage when trying to parse all the
        // mutations for too many seconds making it not responsive.
        //
        // the content script still tracks <a href="tel:xxxx"> elements.
        this.blacklist = [
            '^chrome',
            // we prefer not to add icons in documents
            '^https?.*docs\\.google\\.com.*$',
            '^https?.*drive\\.google\\.com.*$',

            // pages on these websites tend to grow too large to parse them in a reasonable amount of time
            '^https?.*bitbucket\\.org.*$',
            '^https?.*github\\.com.*$',
            '^https?.*rbcommons\\.com.*$',

            // this site has at least tel: support and uses javascript to open a new web page
            // when clicking the anchor element wrapping the inserted icon
            '^https?.*slack\\.com.*$',
        ]

        if (this.app.env.extension) {
            if (this.app.env.extension.background) {
                // The tab indicates that it's ready to observe. Check if it
                // should add the icons.
                this.app.on('page.observer.ready', this.toggleObserve.bind(this))
                this.app.on('clicktodial.dial', this.dial.bind(this))

                this.app.logger.debug(`${this}setting context menuitem`)

                // Remove all previously added context menus.
                chrome.contextMenus.removeAll()
                // Add context menu to dial selected number.
                this.contextMenuItem = chrome.contextMenus.create({
                    title: this.app.translate('contextMenuLabel'),
                    contexts: ['selection'],
                    onclick: (info, tab) => {
                        this.app.dialer.dial(info.selectionText, tab)
                        this.app.analytics.trackClickToDial('Webpage')
                    },
                })
            }
        }

        this.actions = new PageActions(app)
    }


    dial(data) {
        // Dial given number.
        // Block chrome pages.
        if (new RegExp('^chrome').test(data.sender.tab.url) &&
            data.sender.tab.url !== chrome.runtime.getURL('data/panel/html/panel.html') &&
            data.sender.tab.url !== chrome.runtime.getURL('data/panel/html/popout.html')
        ) {
            return
        }
        this.app.dialer.dial(data.b_number, data.sender.tab)
        this.app.analytics.trackClickToDial('Webpage')
    }


    load() {}


    reset() {
        if (this.contextMenuItem) {
            chrome.contextMenus.remove(this.contextMenuItem)
        }

        if (this.app.store.get('c2d')) {
            chrome.tabs.query({}, function(tabs) {
                tabs.forEach(function(tab) {
                    chrome.tabs.sendMessage(tab.id, 'page.observer.stop')
                })
            })
        }
    }


    restore() {}


    /**
     * Switch tab click-to-dial icon observer on or off, based on
     * whether the user is logged in and has click-to-dial
     * This event is sent when the contentScriptFiles are loaded.
     */
    toggleObserve(data) {
        if (!data.sender.tab) return
        if (!this.app.store.get('user')) {
            this.app.logger.info(`${this}not observing because user is not logged in: ${data.sender.tab.url}`)
            data.callback({observe: false})
            return
        }

        if (!this.app.store.get('c2d')) {
            this.app.logger.info(`${this}not observing because icons are disabled: ${data.sender.tab.url}`)
            data.callback({observe: false})
            return
        }

        // Test if one of the blacklisted sites matches.
        let blacklisted = false
        for (let i = 0; i < this.blacklist.length; i++) {
            if (new RegExp(this.blacklist[i]).test(data.sender.tab.url)) {
                blacklisted = true
                break
            }
        }

        if (blacklisted) {
            this.app.logger.info(`${this}not observing because this site is blacklisted: ${data.sender.tab.url}`)
            data.callback({observe: false})
        } else {
            this.app.logger.info(`${this}observing ${data.sender.tab.url}`)
            data.callback({observe: true})
        }
    }


    toString() {
        return `${this.app} [Page]               `
    }

    /**
     * Start looking for phone numbers in the page if
     * click to dial is enabled and the user is authenticated
     */
    watch() {
        // for new tabs
        this.app.on('clicktodial.dial', this.dial.bind(this))
    }
}

module.exports = PageModule