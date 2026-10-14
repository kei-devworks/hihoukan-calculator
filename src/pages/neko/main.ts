import '../../ui/base.css'
import { byId } from '../../ui/dom'
import { mountStockApp } from '../../ui/stock-app'
import { neko } from './config'

mountStockApp(byId('app'), neko)
