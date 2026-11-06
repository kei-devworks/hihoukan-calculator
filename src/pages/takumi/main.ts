import '../../ui/base.css'
import { countVisit } from '../../ui/analytics'
import { byId } from '../../ui/dom'
import { mountTallyApp } from '../../ui/tally-app'
import { takumi } from './config'

countVisit('/takumi')

mountTallyApp(byId('app'), takumi)
