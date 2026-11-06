import '../../ui/base.css'
import { countVisit } from '../../ui/analytics'
import { byId } from '../../ui/dom'
import { mountStockApp } from '../../ui/stock-app'
import { neko } from './config'

countVisit('/neko')

mountStockApp(byId('app'), neko)
